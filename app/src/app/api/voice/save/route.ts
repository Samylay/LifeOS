import { NextRequest, NextResponse } from "next/server";
import { appendToInbox } from "@/lib/voice-inbox";
import { applyTriageReply } from "@/lib/brief/triage-apply";
import { createIdeaBankEntry } from "@/lib/content/idea-bank";
import { createTodoistTask } from "@/lib/todoist-client";
import { confirmPending } from "@/lib/voice-stash";
import { route } from "@/lib/voice-routing";
import { fileVoiceDecision } from "@/lib/decide/voice-decide";

// Commits the (possibly human-edited) transcript from /api/voice to the
// dated vault inbox note. Kept separate from transcription so the client can
// show a review/edit step before anything is written. Since T46 the raw take
// is already durable in `users/local/voicePending` — this route additionally
// marks that pending row confirmed (with where the content went) when the
// client passes its `pendingId` through.
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const transcript = String(body.transcript || "").trim();
    if (!transcript) {
      return NextResponse.json({ error: "transcript is empty" }, { status: 400 });
    }
    const prompt = String(body.prompt || "");
    const category = String(body.category || "note");
    const date = String(body.date || new Date().toISOString().slice(0, 10));
    const pendingId = typeof body.pendingId === "string" ? body.pendingId : "";

    // T36 voice path: a "triage" voice note is verdicts, not a journal entry —
    // route the transcript through the same applier the reply box uses instead
    // of appending it to the inbox. A failed parse leaves the voicePending row
    // unconfirmed, so the spoken verdicts survive beyond this HTTP response.
    if (category === "triage") {
      const result = applyTriageReply(transcript);
      if (pendingId && result.ok) confirmPending(pendingId, { category, triage: result });
      return NextResponse.json({ transcript, triage: result });
    }

    // T-voice-rework-02/03/04: the one-step capture hub with real
    // destinations. route() (voice-routing.ts, ticket 01) decides where a
    // transcript lands and strips any spoken destination prefix ("note:",
    // "task:", "decide:") before a writer ever sees the text, so the prefix
    // never leaks into what gets filed.
    //
    // Every destination reuses the writer that already owns its collection —
    // no destination gets a new write path, so a spoken idea and a typed one
    // are the same record.
    //
    // A write failure must be loud, not silent: each branch returns a non-2xx
    // WITHOUT calling confirmPending, so the pending row stays "pending"
    // (recoverable via voice-stash.ts) and the client's review screen stays
    // open with the transcript still in it. A spoken thought that vanishes
    // because Todoist was down is what stops someone trusting the button.
    if (category === "capture") {
      const routed = route(transcript);
      const text = routed.text || transcript;

      // The card carries no destination key at all, so proposedAction()
      // resolves to null and the deck's existing "Pick an action" state asks
      // Samy to choose. The transcript lands only as inert display text and
      // never reaches legacyDestinationToAction or parseActionRequest — a
      // spoken sentence must not be able to become an agent instruction.
      if (routed.destination === "decide") {
        const { id } = fileVoiceDecision(text);
        if (pendingId) confirmPending(pendingId, { category, destination: "decide", itemId: id });
        return NextResponse.json({ transcript, destination: "decide", itemId: id });
      }

      if (routed.destination === "idea-bank") {
        let id: string;
        try {
          // routed.params.pillar is a free-text hint rather than a validated
          // ContentPillar, so it isn't forwarded — the idea lands unsorted,
          // exactly like one filed by bookmark triage, and gets its type on
          // the content surface during review.
          id = createIdeaBankEntry({ title: text, content: text });
        } catch (e) {
          return NextResponse.json(
            { error: `couldn't file to the idea bank: ${e instanceof Error ? e.message : "write failed"}` },
            { status: 502 }
          );
        }
        if (pendingId) confirmPending(pendingId, { category, destination: "idea-bank", ideaId: id });
        return NextResponse.json({ transcript, destination: "idea-bank", ideaId: id });
      }

      if (routed.destination === "todoist") {
        const result = await createTodoistTask({ content: text, due_string: routed.params.due });
        if (!result.ok) {
          return NextResponse.json(
            { error: `couldn't file to Todoist: ${result.error}` },
            { status: 502 }
          );
        }
        if (pendingId) {
          confirmPending(pendingId, { category, destination: "todoist", taskId: result.taskId });
        }
        return NextResponse.json({ transcript, destination: "todoist", taskId: result.taskId });
      }

      const note = appendToInbox(date, prompt, "capture", text);
      const destination = "vault" as const;
      if (pendingId) confirmPending(pendingId, { category, destination, note });
      return NextResponse.json({ transcript, note, destination });
    }

    const note = appendToInbox(date, prompt, category, transcript);
    if (pendingId) confirmPending(pendingId, { category, note });
    return NextResponse.json({ transcript, note });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "save failed" },
      { status: 500 }
    );
  }
}

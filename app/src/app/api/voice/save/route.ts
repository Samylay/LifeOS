import { NextRequest, NextResponse } from "next/server";
import { appendToInbox } from "@/lib/voice-inbox";
import { applyTriageReply } from "@/lib/brief/triage-apply";
import { createIdeaBankEntry } from "@/lib/content/idea-bank";
import { createTodoistTask } from "@/lib/todoist-client";
import { confirmPending } from "@/lib/voice-stash";
import { route } from "@/lib/voice-routing";

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

    // T-voice-rework-03: the one-step capture hub gets real destinations.
    // The routing module (voice-routing.ts, ticket 01) decides where a
    // transcript lands; this ticket wires the idea bank and Todoist writers
    // it can already name, each reusing the writer that already owns that
    // collection (spec.md "Reused writers, all existing" — no destination
    // gets a new write path). /decide (ticket 04) isn't wired yet, so a
    // spoken decision still falls through to the vault, same as before this
    // ticket — that keeps story 5 ("nothing spoken is ever lost") true
    // without inventing a decide writer ahead of its own ticket.
    //
    // A write failure here must be loud, not silent: this route returns a
    // non-2xx and never calls confirmPending, so the pending row stays
    // "pending" (recoverable — voice-stash.ts) and the client's review
    // screen stays open with the transcript still in it rather than
    // reporting a landing that didn't happen.
    if (category === "capture") {
      const routed = route(transcript);
      const text = routed.text || transcript;

      if (routed.destination === "idea-bank") {
        let id: string;
        try {
          // routed.params.pillar is a free-text hint (voice-routing.ts never
          // actually sets one today) rather than a validated ContentPillar,
          // so it isn't forwarded — an idea lands unsorted, exactly like one
          // filed by bookmark triage, and gets its pillar on the content
          // surface during review.
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

      // "vault" and "decide" (not yet wired — ticket 04) both land here.
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

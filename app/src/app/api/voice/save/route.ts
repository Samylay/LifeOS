import { NextRequest, NextResponse } from "next/server";
import { appendToInbox } from "@/lib/voice-inbox";
import { applyTriageReply } from "@/lib/brief/triage-apply";
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

    // T-voice-rework-02: the one-step capture hub. The routing module
    // (voice-routing.ts, ticket 01) decides the destination. A spoken
    // destination prefix ("note:", "task:", "decide:", …) is recognised and
    // stripped by route() before any writer sees the text, so it never leaks
    // into what lands at the destination.
    if (category === "capture") {
      const routed = route(transcript);

      // T-voice-rework-04: /decide gets its real writer. The card carries an
      // action id from the closed set with typed parameters — never the
      // transcript as an instruction (lib/decide/voice-decide.ts is the
      // trust-boundary note for exactly this). A write that throws here is
      // NOT caught locally: it falls through to the route's own catch below,
      // which returns an error WITHOUT calling confirmPending, so the
      // pending row stays "pending" and the capture is never reported as
      // landed (spec.md story 22, issue 04's last checklist item).
      if (routed.destination === "decide") {
        const { id } = fileVoiceDecision(routed.text || transcript);
        if (pendingId) confirmPending(pendingId, { category, destination: "decide", itemId: id });
        return NextResponse.json({ transcript, destination: "decide", itemId: id });
      }

      // Todoist and the idea bank are ticket 03's writers — not yet wired.
      // Until then every other capture still commits to the vault note so
      // nothing spoken is ever lost (spec.md story 5, a hard rule).
      const note = appendToInbox(date, prompt, "capture", routed.text || transcript);
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

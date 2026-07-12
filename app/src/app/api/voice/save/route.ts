import { NextRequest, NextResponse } from "next/server";
import { appendToInbox } from "@/lib/voice-inbox";
import { applyTriageReply } from "@/lib/brief/triage-apply";
import { confirmPending } from "@/lib/voice-stash";

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

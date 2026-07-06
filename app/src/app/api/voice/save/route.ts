import { NextRequest, NextResponse } from "next/server";
import { appendToInbox } from "@/lib/voice-inbox";

// Commits the (possibly human-edited) transcript from /api/voice to the
// dated vault inbox note. Kept separate from transcription so the client can
// show a review/edit step before anything is written.
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

    const note = appendToInbox(date, prompt, category, transcript);
    return NextResponse.json({ transcript, note });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "save failed" },
      { status: 500 }
    );
  }
}

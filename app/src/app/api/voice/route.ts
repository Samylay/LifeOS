import { NextRequest, NextResponse } from "next/server";

// Prompt-card voice notes: audio → local whisper service on the host →
// transcript returned to the client for review/editing. Nothing is written
// to the vault here — the client sanitizes/edits the transcript, then POSTs
// the final text to /api/voice/save. No routing or classification in v1 —
// the inbox note is the single temporary home until the routing agent exists.
const WHISPER_URL = process.env.WHISPER_URL || "http://host.docker.internal:8091";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const audio = form.get("audio");
    if (!(audio instanceof Blob) || audio.size === 0) {
      return NextResponse.json({ error: "no audio received" }, { status: 400 });
    }

    const res = await fetch(`${WHISPER_URL}/transcribe`, {
      method: "POST",
      headers: { "Content-Type": audio.type || "audio/webm" },
      body: Buffer.from(await audio.arrayBuffer()),
    });
    const data = await res.json();
    if (!res.ok || data.error) {
      return NextResponse.json(
        { error: `transcription failed: ${data.error || res.status}` },
        { status: 502 }
      );
    }
    const transcript = String(data.transcript || "").trim();
    if (!transcript) {
      return NextResponse.json({ error: "empty transcript — try again closer to the mic" }, { status: 422 });
    }

    return NextResponse.json({ transcript, language: data.language });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "voice processing failed" },
      { status: 500 }
    );
  }
}

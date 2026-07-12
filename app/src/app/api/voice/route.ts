import { NextRequest, NextResponse } from "next/server";
import { stashAudio, stashFailure, stashTranscript } from "@/lib/voice-stash";

// Prompt-card voice notes: audio → local whisper service on the host →
// transcript returned to the client for review/editing. The vault write still
// only happens on /api/voice/save — but since T46 the take itself is durable
// from the first byte: audio is written to the data volume BEFORE whisper
// runs, and the raw transcript lands in `users/local/voicePending` before it
// is returned. Abandoned reviews and failed transcriptions are recoverable.
const WHISPER_URL = process.env.WHISPER_URL || "http://host.docker.internal:8091";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const audio = form.get("audio");
    if (!(audio instanceof Blob) || audio.size === 0) {
      return NextResponse.json({ error: "no audio received" }, { status: 400 });
    }

    const mime = audio.type || "audio/webm";
    const buf = Buffer.from(await audio.arrayBuffer());
    // Durable BEFORE transcription (teach.ts pattern) — if this write fails
    // we bail out rather than process audio that has no recoverable copy.
    const audioPath = stashAudio(buf, mime);

    let data: { transcript?: unknown; language?: string; error?: string };
    try {
      const res = await fetch(`${WHISPER_URL}/transcribe`, {
        method: "POST",
        headers: { "Content-Type": mime },
        body: buf,
      });
      data = await res.json();
      if (!res.ok || data.error) {
        stashFailure(audioPath, `transcription failed: ${data.error || res.status}`);
        return NextResponse.json(
          { error: `transcription failed: ${data.error || res.status}` },
          { status: 502 }
        );
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "whisper unreachable";
      stashFailure(audioPath, msg);
      return NextResponse.json({ error: `transcription failed: ${msg}` }, { status: 502 });
    }

    const transcript = String(data.transcript || "").trim();
    if (!transcript) {
      stashFailure(audioPath, "empty transcript");
      return NextResponse.json({ error: "empty transcript — try again closer to the mic" }, { status: 422 });
    }

    const pendingId = stashTranscript({ audioPath, transcript, language: data.language });
    return NextResponse.json({ transcript, language: data.language, pendingId });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "voice processing failed" },
      { status: 500 }
    );
  }
}

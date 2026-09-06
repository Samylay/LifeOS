import { NextRequest, NextResponse } from "next/server";
import { stashAudio, stashFailure, stashTranscript } from "@/lib/voice-stash";
import { transcribeAudio } from "@/lib/voice-transcribe";

// Prompt-card voice notes: audio → local whisper service on the host →
// transcript returned to the client for review/editing. The vault write still
// only happens on /api/voice/save — but since T46 the take itself is durable
// from the first byte: audio is written to the data volume BEFORE whisper
// runs, and the raw transcript lands in `users/local/voicePending` before it
// is returned. Abandoned reviews and failed transcriptions are recoverable.

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

    // T-voice-rework-05: the whisper call itself is shared with the recovery
    // path (voice-reroute.ts's retryTranscription) so a failed take is
    // retried through the exact same transcription logic, not a duplicate.
    const result = await transcribeAudio(buf, mime);
    if (!result.ok) {
      stashFailure(audioPath, result.error || "transcription failed");
      return NextResponse.json({ error: result.error }, { status: result.reason === "empty" ? 422 : 502 });
    }

    const pendingId = stashTranscript({
      audioPath,
      transcript: result.transcript!,
      language: result.language,
    });
    return NextResponse.json({ transcript: result.transcript, language: result.language, pendingId });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "voice processing failed" },
      { status: 500 }
    );
  }
}

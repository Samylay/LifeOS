// The one whisper call, extracted from /api/voice/route.ts (T-voice-rework-05)
// so a failed transcription can be retried from the recent list (voice-stash's
// pending row already has the audio on disk) without duplicating the fetch
// and error-shaping logic that route already got right.
const WHISPER_URL = process.env.WHISPER_URL || "http://host.docker.internal:8091";

export interface TranscribeResult {
  ok: boolean;
  transcript?: string;
  language?: string;
  error?: string;
  // Distinguishes "whisper said nothing" (422 — try again closer to the mic)
  // from "whisper didn't answer at all" (502 — service/network failure), so
  // callers keep the exact status codes the original route shipped with.
  reason?: "empty" | "unreachable";
}

/** Never throws — every failure mode (network, non-2xx, empty transcript)
 * comes back as `{ ok: false, error }` so callers can stash the failure and
 * keep the audio recoverable instead of losing the take to an exception. */
export async function transcribeAudio(buf: Buffer, mime: string): Promise<TranscribeResult> {
  let data: { transcript?: unknown; language?: string; error?: string };
  try {
    const res = await fetch(`${WHISPER_URL}/transcribe`, {
      method: "POST",
      headers: { "Content-Type": mime },
      body: buf as unknown as BodyInit,
    });
    data = await res.json();
    if (!res.ok || data.error) {
      return { ok: false, error: `transcription failed: ${data.error || res.status}`, reason: "unreachable" };
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "whisper unreachable";
    return { ok: false, error: `transcription failed: ${msg}`, reason: "unreachable" };
  }

  const transcript = String(data.transcript || "").trim();
  if (!transcript) {
    return { ok: false, error: "empty transcript — try again closer to the mic", reason: "empty" };
  }
  return { ok: true, transcript, language: data.language };
}

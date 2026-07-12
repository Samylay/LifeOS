// Durable stash for every voice take at transcription time (loss-audit F2,
// ROADMAP T46). Mirrors the teach flow's proven order: audio hits disk
// BEFORE whisper runs, and the raw transcript is persisted BEFORE it is
// returned to the client for review — abandoning the review step, a failed
// whisper call, or a failed downstream interpret can no longer lose the take.
//
// Pending store is `users/local/voicePending` (a DB collection, not a vault
// `<!-- unconfirmed -->` section): unreviewed transcripts must stay out of
// classify.py's inbox sweep, and SQLite rows are just as durable while being
// queryable for a future retention/ageing pass.
import fs from "node:fs";
import path from "node:path";
import { createDoc, updateDoc } from "./server-db";

const PENDING = "users/local/voicePending";

// Same data volume as teach audio (~1MB/min webm-opus; retention/ageing is a
// noted follow-up, not solved here — see ROADMAP T46 log).
const AUDIO_DIR = process.env.VOICE_AUDIO_DIR || "/data/voice-audio";

function enc(d: Date): { __date: string } {
  return { __date: d.toISOString() };
}

/** Write the uploaded audio to the data volume. Never throws on chown-style
 * cosmetics; a failed write DOES throw — the caller must not transcribe
 * audio that has no durable copy. */
export function stashAudio(audio: Buffer, mime: string): string {
  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const dir = path.join(AUDIO_DIR, day);
  fs.mkdirSync(dir, { recursive: true });
  const ext = mime.includes("ogg") ? "ogg" : "webm";
  const stamp = now.toISOString().slice(11, 19).replace(/:/g, "");
  const rand = Math.random().toString(36).slice(2, 6);
  const p = path.join(dir, `${stamp}-${rand}.${ext}`);
  fs.writeFileSync(p, audio);
  return p;
}

/** Persist the raw transcript the moment whisper returns it. */
export function stashTranscript(input: {
  audioPath: string;
  transcript: string;
  language?: string;
}): string {
  return createDoc(PENDING, {
    status: "pending",
    audioPath: input.audioPath,
    transcript: input.transcript,
    language: input.language ?? null,
    createdAt: enc(new Date()),
  });
}

/** Record a failed transcription — the audio file is the recoverable part. */
export function stashFailure(audioPath: string, error: string): string {
  return createDoc(PENDING, {
    status: "failed",
    audioPath,
    transcript: "",
    error,
    createdAt: enc(new Date()),
  });
}

/** Mark a pending take confirmed once a downstream save/apply succeeded.
 * Best-effort: confirmation is bookkeeping, the content is already safe. */
export function confirmPending(pendingId: string, outcome: Record<string, unknown>): void {
  try {
    updateDoc(PENDING, pendingId, {
      status: "confirmed",
      outcome,
      confirmedAt: enc(new Date()),
    });
  } catch {
    // A bad/unknown id must never fail the save that triggered it.
  }
}

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
import { createDoc, getDoc, listDocs, updateDoc } from "./server-db";

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

// --- Recent captures (T-voice-rework-02) ------------------------------------
//
// The capture hub's "recent" list reads this same pending store rather than a
// new collection: every capture already lands here durably at transcription
// time, and `confirmPending` already records which category/destination it
// committed to. Only the hub's own category is surfaced — talk-session and
// assistant-braindump entries use this store too, but they are not captures
// from this surface and would just be noise here.
export interface RecentCapture {
  id: string;
  transcript: string;
  destination: string;
  vaultPath?: string;
  createdAt?: unknown;
}

export function listRecentCaptures(limit = 8): RecentCapture[] {
  const rows = listDocs(PENDING, { orderBy: ["createdAt", "desc"] }) as unknown as Array<{
    id: string;
    status: string;
    transcript: string;
    outcome?: { category?: string; destination?: string; note?: string };
    createdAt?: unknown;
  }>;
  return rows
    .filter((r) => r.status === "confirmed" && r.outcome?.category === "capture")
    .slice(0, limit)
    .map((r) => ({
      id: r.id,
      transcript: r.transcript,
      destination: r.outcome?.destination || "vault",
      vaultPath: r.outcome?.note,
      createdAt: r.createdAt,
    }));
}

// --- Recoverable takes (T-voice-rework-05) ----------------------------------
//
// A capture only ever leaves this store confirmed or discarded — never
// deleted outright, so a take is never actually lost, only marked done with.
// "pending" covers both an unreviewed take and one whose destination write
// failed (api/voice/save never confirms on failure — see its own comment);
// "failed" is a transcription that never produced words at all. Neither
// carries a `category`, because stashTranscript() runs before /api/voice
// knows which surface (this hub, the brief's talk card, the assistant's
// capture tool) the take came from — so, unlike listRecentCaptures(), this
// list is not filtered to the hub's own category. That is deliberate: this
// is the ONE recovery surface for every orphaned voice take in the app, and
// filtering it by an origin no failed/unreviewed row can report yet would
// just make some of those takes permanently invisible.
export interface RecoverableTake {
  id: string;
  status: "pending" | "failed";
  transcript: string;
  error?: string;
  hasAudio: boolean;
  createdAt?: unknown;
}

export function listRecoverableTakes(limit = 8): RecoverableTake[] {
  const rows = listDocs(PENDING, { orderBy: ["createdAt", "desc"] }) as unknown as Array<{
    id: string;
    status: string;
    transcript?: string;
    error?: string;
    audioPath?: string;
    createdAt?: unknown;
  }>;
  return rows
    .filter((r) => r.status === "pending" || r.status === "failed")
    .slice(0, limit)
    .map((r) => ({
      id: r.id,
      status: r.status as "pending" | "failed",
      transcript: r.transcript || "",
      error: r.error,
      hasAudio: Boolean(r.audioPath),
      createdAt: r.createdAt,
    }));
}

/** Reads one pending/failed/confirmed row for reroute/retry orchestration
 * (voice-reroute.ts). Exported here rather than duplicated because this
 * module is the one owner of the `voicePending` collection shape. */
export function getPendingCapture(id: string): {
  id: string;
  status: string;
  transcript: string;
  audioPath?: string;
  error?: string;
  outcome?: { category?: string; destination?: string; note?: string; ideaId?: string; taskId?: string; itemId?: string };
} | null {
  return getDoc(PENDING, id) as unknown as ReturnType<typeof getPendingCapture>;
}

/** Applies the result of a successful reroute: a new outcome and a
 * "confirmed" status, whatever the row's previous status was. */
export function applyReroute(id: string, outcome: Record<string, unknown>): void {
  updateDoc(PENDING, id, {
    status: "confirmed",
    outcome,
    movedAt: enc(new Date()),
  });
}

/** Applies the result of a retry: either a freshly transcribed take (back to
 * "pending", ready to be filed) or a repeat failure (stays "failed" with the
 * latest error) — the audio on disk is untouched either way. */
export function applyRetryTranscription(
  id: string,
  result: { ok: true; transcript: string; language?: string } | { ok: false; error: string },
): void {
  if (result.ok) {
    updateDoc(PENDING, id, {
      status: "pending",
      transcript: result.transcript,
      language: result.language ?? null,
      error: null,
    });
  } else {
    updateDoc(PENDING, id, { status: "failed", error: result.error });
  }
}

/** Marks a take discarded — an exit from the recent list that never deletes
 * the underlying row or audio (spec.md story 13 durability guarantee holds
 * even for a take Samy chooses to drop): "discarded" just means "resolved,
 * stop showing me this," never "gone." */
export function discardPending(id: string): void {
  updateDoc(PENDING, id, { status: "discarded", discardedAt: enc(new Date()) });
}

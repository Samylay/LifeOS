// T-voice-rework-05 — turns a wrong guess into a one-tap fix and a failed
// take into something retryable, without a new write path for any
// destination. Two operations:
//
//   rerouteCapture(id, destination) — files the SAME transcript at a
//   different destination through the same typed writer /api/voice/save
//   uses, then best-effort retracts the copy left at the previous
//   destination so a move doesn't also leave a duplicate behind.
//
//   retryTranscription(id) — re-runs the shared whisper call
//   (voice-transcribe.ts) against the audio already on disk, so a failed
//   take is fixed without re-recording.
//
// Neither operation ever deletes the `voicePending` row itself or the audio
// file — the durable stash (voice-stash.ts) is the one thing this ticket
// must never be able to lose, even when a write to the new destination also
// fails (the row is simply left exactly as it was, still recoverable).
import fs from "node:fs";
import { getPendingCapture, applyReroute, applyRetryTranscription } from "./voice-stash";
import { appendToInbox } from "./voice-inbox";
import { createIdeaBankEntry, deleteIdeaBankEntry } from "./content/idea-bank";
import { createTodoistTask, deleteTodoistTask } from "./todoist-client";
import { fileVoiceDecision, VOICE_DECIDE_COLLECTION } from "./decide/voice-decide";
import { deleteDoc } from "./server-db";
import { extractDue, type VoiceDestination } from "./voice-routing";
import { transcribeAudio } from "./voice-transcribe";

export interface RerouteResult {
  ok: boolean;
  destination?: VoiceDestination;
  error?: string;
}

type PendingOutcome = {
  category?: string;
  destination?: string;
  note?: string;
  ideaId?: string;
  taskId?: string;
  itemId?: string;
};

type WriteOutcome =
  | { ok: true; outcome: PendingOutcome }
  | { ok: false; error: string };

// Writes the transcript at an explicitly chosen destination. Deliberately
// does NOT call classify() — the destination here is a decision Samy just
// made by tapping a button, not a guess to re-run. Todoist still gets a due
// phrase extracted from the words themselves (extractDue is a pure text
// scan, not a re-classification of where it lands).
async function writeToDestination(destination: VoiceDestination, text: string): Promise<WriteOutcome> {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, error: "transcript is empty" };

  if (destination === "idea-bank") {
    try {
      const ideaId = createIdeaBankEntry({ title: trimmed, content: trimmed });
      return { ok: true, outcome: { category: "capture", destination, ideaId } };
    } catch (e) {
      return {
        ok: false,
        error: `couldn't file to the idea bank: ${e instanceof Error ? e.message : "write failed"}`,
      };
    }
  }

  if (destination === "todoist") {
    const result = await createTodoistTask({ content: trimmed, due_string: extractDue(trimmed) });
    if (!result.ok) return { ok: false, error: `couldn't file to Todoist: ${result.error}` };
    return { ok: true, outcome: { category: "capture", destination, taskId: result.taskId ?? undefined } };
  }

  if (destination === "decide") {
    try {
      const { id } = fileVoiceDecision(trimmed);
      return { ok: true, outcome: { category: "capture", destination, itemId: id } };
    } catch (e) {
      return {
        ok: false,
        error: `couldn't file to /decide: ${e instanceof Error ? e.message : "write failed"}`,
      };
    }
  }

  // vault
  try {
    const date = new Date().toISOString().slice(0, 10);
    const note = appendToInbox(date, "", "capture", trimmed);
    return { ok: true, outcome: { category: "capture", destination, note } };
  } catch (e) {
    return { ok: false, error: `couldn't file to the vault: ${e instanceof Error ? e.message : "write failed"}` };
  }
}

// Best-effort: retracting the stale copy must never undo an already
// successful move at the new destination, so every failure here is
// swallowed. Vault notes are the one destination this never touches — the
// stored outcome is a shared dated file path, not the exact appended block,
// and the vault is a journal other content also lives in; surgically
// removing a line from it is not a safe operation to attempt from a path
// this narrow, so a note left behind after a move away from vault is the
// accepted, harmless leftover (the vault is agent substrate Samy doesn't
// read, per spec.md's own diagnosis of the original problem).
async function retractFrom(previous: PendingOutcome | undefined): Promise<void> {
  if (!previous?.destination) return;
  try {
    if (previous.destination === "todoist" && previous.taskId) {
      await deleteTodoistTask(previous.taskId);
    } else if (previous.destination === "idea-bank" && previous.ideaId) {
      deleteIdeaBankEntry(previous.ideaId);
    } else if (previous.destination === "decide" && previous.itemId) {
      deleteDoc(VOICE_DECIDE_COLLECTION, previous.itemId);
    }
  } catch {
    // Swallowed deliberately — see comment above.
  }
}

/**
 * Moves a capture to a different destination in one call: writes the
 * transcript at `destination`, and only on success retracts the copy left at
 * wherever it landed before. A write failure leaves the row exactly as it
 * was — still filed at the old destination if it had one, still recoverable
 * if it did not.
 */
export async function rerouteCapture(id: string, destination: VoiceDestination): Promise<RerouteResult> {
  const row = getPendingCapture(id);
  if (!row) return { ok: false, error: "capture not found" };
  if (row.status === "discarded") return { ok: false, error: "capture was discarded" };
  if (!row.transcript || !row.transcript.trim()) {
    return { ok: false, error: "no transcript to route yet — retry the transcription first" };
  }
  if (row.outcome?.destination === destination) {
    return { ok: false, error: `already filed to ${destination}` };
  }

  const written = await writeToDestination(destination, row.transcript);
  if (!written.ok) return { ok: false, error: written.error };

  await retractFrom(row.outcome);
  applyReroute(id, written.outcome);
  return { ok: true, destination };
}

/**
 * Retries a failed transcription against the audio already stashed on disk
 * (voice-stash.ts's `stashAudio`, always written before whisper runs). Never
 * re-uploads anything — the durability guarantee this ticket exists for is
 * that the audio survives independently of whether transcription succeeds.
 */
export async function retryTranscription(
  id: string,
): Promise<{ ok: boolean; transcript?: string; error?: string }> {
  const row = getPendingCapture(id);
  if (!row) return { ok: false, error: "capture not found" };
  if (!row.audioPath) return { ok: false, error: "no audio on disk to retry from" };

  let buf: Buffer;
  try {
    buf = fs.readFileSync(row.audioPath);
  } catch {
    return { ok: false, error: "audio file is no longer on disk" };
  }

  const mime = row.audioPath.endsWith(".ogg") ? "audio/ogg" : "audio/webm";
  const result = await transcribeAudio(buf, mime);
  if (!result.ok) {
    applyRetryTranscription(id, { ok: false, error: result.error || "transcription failed" });
    return { ok: false, error: result.error };
  }

  applyRetryTranscription(id, { ok: true, transcript: result.transcript!, language: result.language });
  return { ok: true, transcript: result.transcript };
}

// VoicePal — standalone voice-first capture, decoupled from teaching.
//
// The VoicePal core loop (research: ~/scratch/ali-abdaal-apps-research-2026-07-13.md):
//   open → talk immediately → transcribe → the app asks 2–3 interview-style
//   follow-ups ("Shadow Reader") → answer by voice → one-tap TRANSFORM the whole
//   stream into a chosen output format via editable presets that carry Samy's
//   tone. Original audio is kept beside every transcript.
//
// This module is the engine only (no UI). The teaching agent (teach.ts) is a
// sibling that shares the same whisper plumbing and vault discipline; this one
// is general capture: any thought, in Samy's voice, transformed to any format.
//
// No-loss contract (same as teach.ts): every utterance is persisted the moment
// it exists (BEFORE any model call), audio hits disk BEFORE transcription, the
// vault write happens BEFORE the status flip, and an abandoned capture is swept
// and routed exactly like a clean finish. Nothing is ever only in memory.
import fs from "node:fs";
import path from "node:path";
import { createDoc, deleteDoc, getDoc, listDocs, updateDoc } from "./server-db";
import { generateJson, generateText } from "./claude-cli";

const CAPTURES = "users/local/voiceCaptures";
const UTTERANCES = "users/local/voiceUtterances";
const PRESETS = "users/local/voicePresets";

// Same vault-write conventions as voice-inbox.ts / teach.ts (container runs as
// root, vault owned by the host user).
const KB_PATH = process.env.KB_PATH || "/vault";
const CAPTURE_INBOX_DIR = "01-Inbox/voice";
const KB_UID = process.env.KB_UID ? Number(process.env.KB_UID) : 1000;
const KB_GID = process.env.KB_GID ? Number(process.env.KB_GID) : 1000;

// Original audio kept beside the transcript (VoicePal pattern #4) on the
// lifeos-data volume; ~1MB/min of webm-opus is storage-cheap.
const AUDIO_DIR = process.env.VOICEPAL_AUDIO_DIR || "/data/voicepal-audio";

// A live capture with no activity for this long is considered abandoned and
// gets swept to the vault (no content lost).
const STALE_MS = 3 * 60 * 60 * 1000;

export interface VoiceCapture {
  id: string;
  title: string; // derived from the first utterance; editable later
  status: "live" | "ended" | "routed";
  abandoned?: boolean;
  // Which preset the stream was last transformed with, and the resulting draft.
  transformPresetId?: string;
  transformFormat?: string;
  draft?: string;
  startedAt?: unknown;
  lastActivityAt?: unknown;
  endedAt?: unknown;
  vaultPath?: string;
}

export interface VoiceUtterance {
  id: string;
  captureId: string;
  idx: number;
  // "raw" = a spoken stream; "prompt" = a follow-up the app asked;
  // "answer" = Samy answering a follow-up (still just his words).
  role: "raw" | "prompt" | "answer";
  text: string;
  audioPath?: string;
  createdAt?: unknown;
}

// A transform preset: a named output format that carries tone + audience so the
// draft comes out in Samy's voice, not generic AI prose (research pattern #4 —
// "it helps you speak your ideas, then turns them into a first draft").
export interface VoicePreset {
  id: string;
  name: string;
  // The instruction handed to the model, minus the transcript. Owns tone.
  instruction: string;
  builtin?: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

// Seed presets — Samy's defaults. Editable via the presets API; builtin ones
// are re-seeded if missing but never overwrite a user edit.
const DEFAULT_PRESETS: Array<{ key: string; name: string; instruction: string }> = [
  {
    key: "vault-note",
    name: "Vault note",
    instruction:
      "Turn this into a clean Obsidian vault note: a short H1 title, then tight prose or bullets capturing the ideas. Keep Samy's own phrasing and emphasis; do not add filler or a generic AI intro/outro.",
  },
  {
    key: "journal-entry",
    name: "Journal entry",
    instruction:
      "Rewrite this as a first-person journal entry in Samy's voice — reflective, honest, present tense where natural. Preserve his wording and feelings; smooth only the spoken disfluencies. No headings, no advice, no meta commentary.",
  },
  {
    key: "content-os-script",
    name: "Content-OS script",
    instruction:
      "Turn this into a first-draft short-form video/post script for Samy's build-in-public brand (Content OS). Hook first line, then his idea in his voice, then a light CTA. Keep it punchy and in first person; do not invent claims he did not make.",
  },
  {
    key: "tweet-thread",
    name: "Tweet thread",
    instruction:
      "Turn this into a tweet thread (3–7 tweets) in Samy's voice. First tweet is the hook. One idea per tweet, plain language, no hashtags, no emoji spam. Keep his phrasing; do not embellish beyond what he said.",
  },
];

// --- Presets ---------------------------------------------------------------

/** List presets, seeding the builtin defaults on first use (idempotent). */
export function listPresets(): VoicePreset[] {
  const existing = listDocs(PRESETS) as unknown as VoicePreset[];
  const byName = new Set(existing.filter((p) => p.builtin).map((p) => p.name));
  for (const d of DEFAULT_PRESETS) {
    if (!byName.has(d.name)) {
      createDoc(PRESETS, { name: d.name, instruction: d.instruction, builtin: true });
    }
  }
  return (listDocs(PRESETS, { orderBy: ["name", "asc"] }) as unknown as VoicePreset[]);
}

export function createPreset(name: string, instruction: string): string {
  return createDoc(PRESETS, { name, instruction, builtin: false });
}

export function updatePreset(id: string, patch: { name?: string; instruction?: string }): void {
  const clean: Record<string, unknown> = {};
  if (typeof patch.name === "string") clean.name = patch.name;
  if (typeof patch.instruction === "string") clean.instruction = patch.instruction;
  updateDoc(PRESETS, id, clean);
}

export function deletePreset(id: string): void {
  deleteDoc(PRESETS, id);
}

// --- Capture lifecycle ------------------------------------------------------

export function startCapture(): string {
  return createDoc(CAPTURES, {
    title: "Untitled capture",
    status: "live",
    startedAt: new Date(),
    lastActivityAt: new Date(),
  });
}

export function getCapture(
  captureId: string
): { capture: VoiceCapture; utterances: VoiceUtterance[] } | null {
  const capture = getDoc(CAPTURES, captureId) as unknown as VoiceCapture | null;
  if (!capture) return null;
  const utterances = listDocs(UTTERANCES, {
    where: [["captureId", "==", captureId]],
    orderBy: ["idx", "asc"],
  }) as unknown as VoiceUtterance[];
  return { capture, utterances };
}

export function listCaptures(limit = 20): VoiceCapture[] {
  return (listDocs(CAPTURES, { orderBy: ["startedAt", "desc"] }) as unknown as VoiceCapture[]).slice(
    0,
    limit
  );
}

export function saveAudio(captureId: string, idx: number, audio: Buffer, mime: string): string {
  const ext = mime.includes("ogg") ? "ogg" : "webm";
  const dir = path.join(AUDIO_DIR, captureId);
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, `${String(idx).padStart(3, "0")}.${ext}`);
  fs.writeFileSync(p, audio);
  return p;
}

/** Persist an utterance immediately (no-loss), keep the title fresh from the
 * first raw stream, and return the follow-up questions the Shadow Reader asks.
 * The utterance survives even if follow-up generation fails or the client
 * disappears. */
export async function addUtterance(
  captureId: string,
  text: string,
  role: VoiceUtterance["role"] = "raw",
  audioPath?: string
): Promise<{ followUps: string[] }> {
  const found = getCapture(captureId);
  if (!found) throw new Error("unknown capture");
  const { capture, utterances } = found;
  if (capture.status !== "live") throw new Error("capture is not live");
  const idx = utterances.length;
  createDoc(UTTERANCES, { captureId, idx, role, text, audioPath });
  const patch: Record<string, unknown> = { lastActivityAt: new Date() };
  // Title the capture from its first words, so it's findable before transform.
  if (idx === 0 || capture.title === "Untitled capture") {
    patch.title = text.trim().split(/\s+/).slice(0, 8).join(" ").slice(0, 80) || capture.title;
  }
  updateDoc(CAPTURES, captureId, patch);

  const followUps = await shadowReader([...utterances, { role, text } as VoiceUtterance]);
  return { followUps };
}

/** The Shadow Reader: 2–3 short interview-style follow-ups that push the
 * thought deeper — VoicePal's crown jewel. Best-effort; never throws (a failed
 * model call just means no follow-ups this turn, the utterance is already
 * safe). */
async function shadowReader(utterances: VoiceUtterance[]): Promise<string[]> {
  const stream = utterances
    .slice(-10)
    .map((u) => (u.role === "prompt" ? `Q: ${u.text}` : u.text))
    .join("\n");
  try {
    const out = await generateJson<{ followUps?: string[] }>(
      `You are a sharp, curious interviewer helping Samy think out loud. He just SPOKE the following (transcribed). Ask 2–3 short, spoken-style follow-up questions that make him go one level deeper or fill an obvious gap — the kind a great podcast host asks. No preamble, no restating what he said.\n\nWHAT HE SAID:\n${stream}\n\nJSON: {"followUps": ["...", "..."]}`
    );
    return (out.followUps || []).slice(0, 3).filter(Boolean);
  } catch {
    return [];
  }
}

// --- Transform --------------------------------------------------------------

function fullTranscript(utterances: VoiceUtterance[]): string {
  return utterances
    .map((u) => {
      if (u.role === "prompt") return `(follow-up asked: ${u.text})`;
      return u.text;
    })
    .join("\n\n");
}

/** One-tap transform: assemble the whole stream and render it through a preset
 * into a draft in Samy's tone. Persists the draft + which preset produced it,
 * so it survives a reload and rides along to the vault on finish. */
export async function transform(
  captureId: string,
  presetId: string
): Promise<{ draft: string; format: string }> {
  const found = getCapture(captureId);
  if (!found) throw new Error("unknown capture");
  const preset = getDoc(PRESETS, presetId) as unknown as VoicePreset | null;
  if (!preset) throw new Error("unknown preset");
  const transcript = fullTranscript(found.utterances);
  if (!transcript.trim()) throw new Error("nothing captured yet");

  const draft = (
    await generateText(
      `${preset.instruction}\n\nWork ONLY from what Samy actually said below. Keep his voice; do not invent facts, opinions, or details he did not state. Output only the finished draft — no preamble, no "here is", no notes.\n\n--- WHAT SAMY SAID ---\n${transcript}\n--- END ---`
    )
  ).trim();

  updateDoc(CAPTURES, captureId, {
    transformPresetId: presetId,
    transformFormat: preset.name,
    draft,
    lastActivityAt: new Date(),
  });
  return { draft, format: preset.name };
}

// --- Ending + routing to the vault (Hermes intake) --------------------------

/** End a capture and route it to the vault inbox. Idempotent; the vault write
 * precedes the status flip so a failed write leaves the capture "ended" for the
 * sweep to retry. The transcript is always written; the transformed draft is
 * included when one exists. */
export async function endCapture(captureId: string, abandoned = false): Promise<string> {
  const found = getCapture(captureId);
  if (!found) throw new Error("unknown capture");
  const { capture, utterances } = found;
  if (capture.status === "routed") return capture.vaultPath || "";
  if (capture.status === "live") {
    updateDoc(CAPTURES, captureId, { status: "ended", abandoned, endedAt: new Date() });
  }

  const transcriptMd = fullTranscript(utterances) || "_no utterances captured_";
  const date = new Date().toISOString().slice(0, 10);
  const slug =
    (capture.title || "capture")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "capture";
  const rel = `${CAPTURE_INBOX_DIR}/${date}-${slug}-${captureId.slice(0, 6)}.md`;
  const full = path.join(KB_PATH, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  const body = `# Voice capture — ${capture.title}

- date: ${date}
- capture: ${captureId}
- utterances: ${utterances.length}${abandoned ? "\n- note: capture was abandoned mid-flow and swept automatically (no content lost)" : ""}

${
  capture.draft
    ? `## Draft — ${capture.transformFormat || "transform"}\n\n${capture.draft}\n\n`
    : ""
}## Transcript

${transcriptMd}
`;
  fs.writeFileSync(full, body, "utf-8");
  try {
    fs.chownSync(path.dirname(full), KB_UID, KB_GID);
    fs.chownSync(full, KB_UID, KB_GID);
  } catch {
    // local dev — perms already fine
  }

  updateDoc(CAPTURES, captureId, { status: "routed", vaultPath: rel });
  return rel;
}

/** Sweep: force-end stale live captures and retry ended-but-unrouted ones.
 * Wire alongside teach's sweep (grabbers cron / manual endpoint). */
export async function sweepStaleCaptures(): Promise<{ swept: string[]; retried: string[] }> {
  const swept: string[] = [];
  const retried: string[] = [];
  const now = Date.now();
  const live = listDocs(CAPTURES, { where: [["status", "==", "live"]] }) as unknown as VoiceCapture[];
  for (const c of live) {
    const last = toMs(c.lastActivityAt) ?? toMs(c.startedAt) ?? 0;
    if (now - last > STALE_MS) {
      await endCapture(c.id, true);
      swept.push(c.id);
    }
  }
  const ended = listDocs(CAPTURES, { where: [["status", "==", "ended"]] }) as unknown as VoiceCapture[];
  for (const c of ended) {
    await endCapture(c.id, Boolean(c.abandoned));
    retried.push(c.id);
  }
  return { swept, retried };
}

export function toMs(v: unknown): number | null {
  if (v instanceof Date) return v.getTime();
  if (v && typeof v === "object" && "__date" in v) {
    return toMs((v as { __date: string }).__date);
  }
  if (typeof v === "string" || typeof v === "number") {
    const t = new Date(v).getTime();
    return Number.isNaN(t) ? null : t;
  }
  return null;
}

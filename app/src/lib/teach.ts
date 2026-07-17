// Voice teaching sessions — VoicePal-style capture crossed with Matt
// Pocock's /teach method (github.com/mattpocock/skills, productivity/teach):
// mission-grounded lessons, zone of proximal development from learning
// records, retrieval practice for storage strength, and 2–3 interview-style
// follow-up questions after every learner turn.
//
// No-loss contract: every turn is persisted the moment it exists (learner
// turns BEFORE the model call, tutor turns on arrival), and a session that
// never gets ended is swept — stale live sessions are force-ended and routed
// to the vault inbox (Hermes's intake) exactly like a clean finish.
import fs from "node:fs";
import path from "node:path";
import { createDoc, getDoc, listDocs, updateDoc } from "./server-db";
import { generateJson } from "./claude-cli";
import { TRIAGE_COLLECTION } from "./triage-ingest";
import type { TriageItem } from "./triage";

const TOPICS = "users/local/teachTopics";
const SESSIONS = "users/local/teachSessions";
const TURNS = "users/local/teachTurns";
// The controlled topic-tag list a topic's own `tags` draw from. `neverPropose`
// is the ONLY eligibility mechanism for T58's tag-cluster proposals — once
// tombstoned, a tag never proposes "learn this" again.
const TOPIC_TAGS = "users/local/topicTags";

// Same vault-write conventions as voice-inbox.ts (container runs as root,
// vault owned by the host user).
const KB_PATH = process.env.KB_PATH || "/vault";
const TEACH_INBOX_DIR = "01-Inbox/teaching";
const KB_UID = process.env.KB_UID ? Number(process.env.KB_UID) : 1000;
const KB_GID = process.env.KB_GID ? Number(process.env.KB_GID) : 1000;

// Original audio kept beside the transcript (VoicePal pattern #4) on the
// lifeos-data volume; ~1MB/min of webm-opus is storage-cheap.
const AUDIO_DIR = process.env.TEACH_AUDIO_DIR || "/data/teach-audio";

// A live session with no activity for this long is considered abandoned.
const STALE_MS = 3 * 60 * 60 * 1000;

export interface TeachTopic {
  id: string;
  topic: string; // a sentence
  mission: string; // WHY he wants this — REQUIRED, grounds every lesson (MISSION.md analogue)
  tags: string[]; // controlled topic-tags this topic owns (drives T56 attachment by overlap)
  origin: "authored" | "proposed"; // authored = Samy typed it; proposed = accepted from a T58 tag-cluster proposal
  status: "queued" | "scheduled" | "active" | "done";
  scheduledFor?: string; // YYYY-MM-DD
  // Learning records — ADR-style capture of what he now knows / where he
  // struggled; drives zone-of-proximal-development for the next session.
  learningRecords: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

/** Controlled topic-tag ledger entry — `neverPropose` tombstones a tag so
 * T58's cluster proposals stop asking about it (map 11's ONLY eligibility
 * mechanism; no `learnable` model judgement). */
export interface TopicTag {
  id: string;
  tag: string;
  neverPropose: boolean;
}

export interface TeachSession {
  id: string;
  topicId: string;
  topic: string;
  status: "live" | "ended" | "routed";
  abandoned?: boolean;
  startedAt?: unknown;
  lastActivityAt?: unknown;
  endedAt?: unknown;
  vaultPath?: string;
}

export interface TeachTurn {
  id: string;
  sessionId: string;
  idx: number;
  role: "learner" | "tutor";
  text: string;
  followUps?: string[];
  audioPath?: string;
  createdAt?: unknown;
}

// --- Learning queue -------------------------------------------------------

/** Tolerant read: docs written before this schema (no `tags`/`origin`, or a
 * pre-container `origin` string) still load — absent fields default rather
 * than crash. Never migrates the doc on disk (that's Samy's call, T64c). */
function normalizeTopic(id: string, raw: Record<string, unknown>): TeachTopic {
  return {
    id,
    topic: String(raw.topic ?? ""),
    mission: String(raw.mission ?? ""),
    tags: Array.isArray(raw.tags) ? (raw.tags as string[]) : [],
    origin: raw.origin === "proposed" ? "proposed" : "authored",
    status: (raw.status as TeachTopic["status"]) ?? "queued",
    scheduledFor: raw.scheduledFor as string | undefined,
    learningRecords: Array.isArray(raw.learningRecords) ? (raw.learningRecords as string[]) : [],
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

export function getTopic(topicId: string): TeachTopic | null {
  const raw = getDoc(TOPICS, topicId) as Record<string, unknown> | null;
  return raw ? normalizeTopic(topicId, raw) : null;
}

/** mission is REQUIRED (map 06 — a topic cannot exist without a why). */
export function addTopic(
  topic: string,
  mission: string,
  tags: string[] = [],
  origin: "authored" | "proposed" = "authored"
): string {
  const m = mission.trim();
  if (!m) throw new Error("mission is required");
  return createDoc(TOPICS, {
    topic,
    mission: m,
    tags,
    origin,
    status: "queued",
    learningRecords: [],
  });
}

/** Tombstones a topic-tag permanently — T58's ONLY eligibility mechanism.
 * Idempotent: re-tombstoning an already-tombstoned tag is a no-op write. */
export function neverProposeTag(tag: string): void {
  const existing = listDocs(TOPIC_TAGS, { where: [["tag", "==", tag]] }) as unknown as TopicTag[];
  if (existing.length) {
    updateDoc(TOPIC_TAGS, existing[0].id, { neverPropose: true });
  } else {
    createDoc(TOPIC_TAGS, { tag, neverPropose: true });
  }
}

export function isTagTombstoned(tag: string): boolean {
  const existing = listDocs(TOPIC_TAGS, { where: [["tag", "==", tag]] }) as unknown as TopicTag[];
  return existing.some((t) => t.neverPropose);
}

export function scheduleTopic(topicId: string, date: string): void {
  updateDoc(TOPICS, topicId, { status: "scheduled", scheduledFor: date });
}

/** Date of the most recent learning record, parsed from its `YYYY-MM-DD: `
 * prefix (the format `endSession` writes) — the "last-taught date" shown on
 * `/knowledge` (map 03). Never taught yet ⇒ null, not a fabricated date. */
export function lastTaughtDate(topic: Pick<TeachTopic, "learningRecords">): string | null {
  const records = topic.learningRecords || [];
  for (let i = records.length - 1; i >= 0; i--) {
    const m = /^(\d{4}-\d{2}-\d{2}):/.exec(records[i]);
    if (m) return m[1];
  }
  return null;
}

/** Topics scheduled for today or earlier — consumed by the morning
 * attention push so a scheduled session reaches Samy as a card. */
export function dueTopics(today: string): TeachTopic[] {
  return (listDocs(TOPICS, { where: [["status", "==", "scheduled"]] }) as unknown as Array<{ id: string } & Record<string, unknown>>)
    .map((raw) => normalizeTopic(raw.id, raw))
    .filter((t) => (t.scheduledFor || "") <= today);
}

// --- Attachment (T56) -------------------------------------------------------

/** An item attaches to a topic iff their tags overlap — permissive by design
 * (T59's session synthesis does the fit-filtering, not attachment). Ignores
 * `status`: a discarded item still attaches (map 05 — the rubric decides
 * filing; his topics decide learning; map 09 — letting a rubric discard prune
 * learning supply is exactly the banned ROI judgement). One item may attach
 * to many topics — no stored edge, so a topic's tags changing retro-attaches
 * with no writes to items. */
export function attachedItems(topicId: string): TriageItem[] {
  const topic = getTopic(topicId);
  if (!topic || topic.tags.length === 0) return [];
  const tagSet = new Set(topic.tags);
  return (listDocs(TRIAGE_COLLECTION) as unknown as TriageItem[]).filter((item) =>
    (item.topicTags || []).some((t) => tagSet.has(t))
  );
}

// --- Sessions ---------------------------------------------------------------

export function startSession(topicId: string): { sessionId: string; opening: Promise<string> } {
  const topic = getTopic(topicId);
  if (!topic) throw new Error("unknown topic");
  const sessionId = createDoc(SESSIONS, {
    topicId,
    topic: topic.topic,
    status: "live",
    lastActivityAt: new Date(),
    startedAt: new Date(),
  });
  updateDoc(TOPICS, topicId, { status: "active" });
  // Opening tutor turn: greet, ground in mission, first probing question.
  const opening = tutorReply(sessionId, topic, [], "").then((r) => r.text);
  return { sessionId, opening };
}

export function getSession(sessionId: string): { session: TeachSession; turns: TeachTurn[] } | null {
  const session = getDoc(SESSIONS, sessionId) as unknown as TeachSession | null;
  if (!session) return null;
  const turns = (listDocs(TURNS, {
    where: [["sessionId", "==", sessionId]],
    orderBy: ["idx", "asc"],
  }) as unknown as TeachTurn[]);
  return { session, turns };
}

export function saveAudio(sessionId: string, idx: number, audio: Buffer, mime: string): string {
  const ext = mime.includes("ogg") ? "ogg" : "webm";
  const dir = path.join(AUDIO_DIR, sessionId);
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, `${String(idx).padStart(3, "0")}.${ext}`);
  fs.writeFileSync(p, audio);
  return p;
}

/** Persist the learner's turn immediately, then get the tutor's reply.
 * The learner turn survives even if the model call fails or the client
 * disappears — no-loss by construction. */
export async function learnerTurn(
  sessionId: string,
  transcript: string,
  audioPath?: string
): Promise<{ text: string; followUps: string[] }> {
  const found = getSession(sessionId);
  if (!found) throw new Error("unknown session");
  const { session, turns } = found;
  if (session.status !== "live") throw new Error("session is not live");
  const idx = turns.length;
  createDoc(TURNS, { sessionId, idx, role: "learner", text: transcript, audioPath });
  updateDoc(SESSIONS, sessionId, { lastActivityAt: new Date() });
  const topic = getTopic(session.topicId);
  const reply = await tutorReply(sessionId, topic, turns, transcript);
  return reply;
}

async function tutorReply(
  sessionId: string,
  topic: TeachTopic | null,
  priorTurns: TeachTurn[],
  latest: string
): Promise<{ text: string; followUps: string[] }> {
  const history = priorTurns
    .slice(-12)
    .map((t) => `${t.role === "learner" ? "SAMY" : "TUTOR"}: ${t.text}`)
    .join("\n");
  const records = (topic?.learningRecords || []).slice(-8).join("\n- ");
  const prompt = `You are Samy's voice tutor. He is SPEAKING his answers aloud (transcribed), so keep replies short enough to absorb by ear: 3-6 sentences, no headings, no lists, no code blocks.

Method (Matt Pocock's /teach, adapted for voice):
- Ground everything in his MISSION for this topic. If the mission is vague, your first questions establish it.
- Work in his zone of proximal development: use the learning records below to pitch difficulty "just enough".
- Build STORAGE strength, not fluency: prefer retrieval practice — ask him to explain back, predict, or apply, rather than re-explaining what he just heard.
- Teach one tightly-scoped thing per exchange, tied to the mission.
- Like an interviewer, ALWAYS end with followUps: 2-3 short spoken-style questions that probe his understanding or push one level deeper. These keep him talking.

TOPIC: ${topic?.topic || "unknown"}
MISSION: ${topic?.mission || "not yet established — find out"}
LEARNING RECORDS (what he already worked through):${records ? `\n- ${records}` : " none yet — this is the first session"}

CONVERSATION SO FAR:
${history || "(session just started — open by connecting the topic to his mission and asking what he already knows)"}
${latest ? `\nSAMY (just said): ${latest}` : ""}

Respond as JSON: {"reply": "...", "followUps": ["...", "..."]}`;

  const out = await generateJson<{ reply: string; followUps?: string[] }>(prompt);
  const text = out.reply?.trim() || "Tell me more about that.";
  const followUps = (out.followUps || []).slice(0, 3);
  const idx = priorTurns.length + (latest ? 1 : 0);
  createDoc(TURNS, { sessionId, idx, role: "tutor", text, followUps });
  updateDoc(SESSIONS, sessionId, { lastActivityAt: new Date() });
  return { text, followUps };
}

// --- Ending + routing to Hermes ---------------------------------------------

/** End a session and route it to the vault inbox (Hermes's watched intake).
 * Idempotent: safe to call on an already-ended-but-unrouted session. The
 * vault write happens BEFORE the status flip; a failed write leaves the
 * session "ended" so the sweep retries it next pass. */
export async function endSession(sessionId: string, abandoned = false): Promise<string> {
  const found = getSession(sessionId);
  if (!found) throw new Error("unknown session");
  const { session, turns } = found;
  if (session.status === "routed") return session.vaultPath || "";
  if (session.status === "live") {
    updateDoc(SESSIONS, sessionId, { status: "ended", abandoned, endedAt: new Date() });
  }

  const transcriptMd = turns
    .map((t) => `**${t.role === "learner" ? "Samy" : "Tutor"}:** ${t.text}`)
    .join("\n\n");

  // Summary + learning record. Best-effort: an abandoned or tiny session
  // still routes with the raw transcript even if generation fails.
  let summary = "";
  let record = "";
  if (turns.some((t) => t.role === "learner")) {
    try {
      const out = await generateJson<{ summary: string; learningRecord: string }>(
        `Summarize this voice teaching session in 3-5 sentences, then write ONE learning-record line (ADR-style: what Samy now understands / where he struggled — non-obvious insights only).\n\n${transcriptMd}\n\nJSON: {"summary": "...", "learningRecord": "..."}`
      );
      summary = out.summary?.trim() || "";
      record = out.learningRecord?.trim() || "";
    } catch {
      summary = "";
    }
  }

  const date = new Date().toISOString().slice(0, 10);
  const slug = (session.topic || "session")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  const rel = `${TEACH_INBOX_DIR}/${date}-${slug}-${sessionId.slice(0, 6)}.md`;
  const full = path.join(KB_PATH, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  const body = `# Teaching session — ${session.topic}

- date: ${date}
- session: ${sessionId}
- turns: ${turns.length}${abandoned ? "\n- note: session was abandoned mid-flow and swept automatically (no turns lost)" : ""}

${summary ? `## Summary\n\n${summary}\n\n` : ""}${record ? `## Learning record\n\n${record}\n\n` : ""}## Transcript

${transcriptMd || "_no learner turns_"}
`;
  fs.writeFileSync(full, body, "utf-8");
  try {
    fs.chownSync(path.dirname(full), KB_UID, KB_GID);
    fs.chownSync(full, KB_UID, KB_GID);
  } catch {
    // local dev — perms already fine
  }

  updateDoc(SESSIONS, sessionId, { status: "routed", vaultPath: rel });
  if (record) {
    const topic = getTopic(session.topicId);
    if (topic) {
      updateDoc(TOPICS, session.topicId, {
        status: "queued", // back in the queue; "done" is Samy's call
        learningRecords: [...(topic.learningRecords || []), `${date}: ${record}`],
      });
    }
  }
  return rel;
}

/** Sweep: force-end stale live sessions and retry ended-but-unrouted ones.
 * Called nightly (grabbers cron) and manually via /api/teach/sweep. */
export async function sweepStaleSessions(): Promise<{ swept: string[]; retried: string[] }> {
  const swept: string[] = [];
  const retried: string[] = [];
  const now = Date.now();
  const live = listDocs(SESSIONS, { where: [["status", "==", "live"]] }) as unknown as TeachSession[];
  for (const s of live) {
    const last = toMs(s.lastActivityAt) ?? toMs(s.startedAt) ?? 0;
    if (now - last > STALE_MS) {
      await endSession(s.id, true);
      swept.push(s.id);
    }
  }
  const ended = listDocs(SESSIONS, { where: [["status", "==", "ended"]] }) as unknown as TeachSession[];
  for (const s of ended) {
    await endSession(s.id, Boolean(s.abandoned));
    retried.push(s.id);
  }
  return { swept, retried };
}

export function toMs(v: unknown): number | null {
  if (v instanceof Date) return v.getTime();
  // server-db stores client-written dates as { __date: "<iso>" } markers.
  if (v && typeof v === "object" && "__date" in v) {
    return toMs((v as { __date: string }).__date);
  }
  if (typeof v === "string" || typeof v === "number") {
    const t = new Date(v).getTime();
    return Number.isNaN(t) ? null : t;
  }
  return null;
}

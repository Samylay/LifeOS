// T24 — pure intent parsing for daily-planning checkpoint replies.
// See ~/loop-me/workflows/daily-planning.md "Checkpoint": plain-text replies
// can reschedule a tentative block, decline one for today, answer a Todoist
// placement question, or add a new item. This module is deliberately
// transport-agnostic (no I/O, no Telegram/pager/voice assumptions): any
// ingestion path hands it text + today's context and gets an intent back.
// api/plan/reply/route.ts executes the intents against Google Calendar.
import { localTimeToUtcIso } from "./tz";
import { TENTATIVE_PREFIX } from "./tentative-blocks";

export interface PlanBlock {
  eventId: string;
  title: string; // as on the calendar, incl. tentative prefix
  startIso: string;
  endIso: string;
}

export interface PlanPlacement {
  id: string; // Todoist task id
  content: string;
}

export interface PlanReplyContext {
  dateStr: string; // YYYY-MM-DD, the day being planned
  tz: string;
  blocks: PlanBlock[];
  placements: PlanPlacement[];
}

export type PlanIntent =
  | { type: "reschedule"; eventId: string; blockTitle: string; startIso: string; endIso: string }
  | { type: "decline"; eventId: string; blockTitle: string }
  | { type: "place"; todoistId: string; content: string; startIso: string; endIso: string }
  | { type: "add"; title: string; startIso: string; endIso: string }
  | { type: "unknown"; reason: string };

const DEFAULT_BLOCK_MINUTES = 30;

/** "6pm" | "6:30pm" | "18:00" | "18h" | "18h30" | bare "18" -> {hour, minute}. */
export function parseTimeOfDay(raw: string): { hour: number; minute: number } | null {
  const s = raw.trim().toLowerCase();
  const m = s.match(/^(\d{1,2})(?::(\d{2})|h(\d{2})?)?\s*(am|pm)?$/);
  if (!m) return null;
  let hour = parseInt(m[1], 10);
  const minute = parseInt(m[2] ?? m[3] ?? "0", 10);
  const meridiem = m[4];
  if (minute > 59) return null;
  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  if (hour > 23) return null;
  return { hour, minute };
}

/** "45 min" | "1h" | "1h30" | "90m" -> minutes. */
function parseDuration(raw: string): number | null {
  const s = raw.trim().toLowerCase();
  let m = s.match(/^(\d+)\s*(?:min(?:ute)?s?|m)$/);
  if (m) return parseInt(m[1], 10);
  m = s.match(/^(\d+)\s*h(?:ours?)?(?:\s*(\d{1,2}))?$/);
  if (m) return parseInt(m[1], 10) * 60 + parseInt(m[2] ?? "0", 10);
  return null;
}

function normalize(s: string): string {
  return s
    .replace(TENTATIVE_PREFIX.trim(), "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Word-overlap match: the candidate whose title shares the most query words wins. */
function bestMatch<T>(query: string, candidates: T[], titleOf: (c: T) => string): T | null {
  const qWords = normalize(query).split(" ").filter((w) => w.length >= 2);
  if (qWords.length === 0) return null;
  let best: T | null = null;
  let bestScore = 0;
  for (const c of candidates) {
    const title = normalize(titleOf(c));
    const titleWords = new Set(title.split(" "));
    let score = qWords.filter((w) => titleWords.has(w)).length;
    // Substring fallback for partial words ("poly" -> "polymath").
    if (score === 0 && qWords.some((w) => w.length >= 4 && title.includes(w))) score = 0.5;
    if (score > bestScore) {
      best = c;
      bestScore = score;
    }
  }
  return bestScore > 0 ? best : null;
}

function toIsoRange(
  ctx: PlanReplyContext,
  time: { hour: number; minute: number },
  minutes: number
): { startIso: string; endIso: string } {
  const startIso = localTimeToUtcIso(ctx.dateStr, time.hour, time.minute, ctx.tz);
  const endIso = new Date(Date.parse(startIso) + minutes * 60_000).toISOString();
  return { startIso, endIso };
}

function blockMinutes(b: PlanBlock): number {
  const ms = Date.parse(b.endIso) - Date.parse(b.startIso);
  return Number.isFinite(ms) && ms > 0 ? Math.round(ms / 60_000) : DEFAULT_BLOCK_MINUTES;
}

const RESCHEDULE_RE = /^(?:push|move|reschedule|shift)\s+(?:the\s+)?(.+?)\s+to\s+(.+?)\s*$/i;
const DECLINE_RE =
  /^(?:skip|cancel|drop|decline|remove)\s+(?:the\s+)?(.+?)(?:\s+(?:for\s+)?today)?\s*$/i;
const WONT_RE = /^(?:i\s+)?(?:won'?t|not)\s+(?:do(?:ing)?\s+)?(?:the\s+)?(.+?)(?:\s+today)?\s*$/i;
const PLACE_RE = /^(?:schedule|put|plan|do)\s+(?:the\s+)?(.+?)\s+at\s+(.+?)\s*$/i;
const ADD_RE = /^add\s+(.+?)(?:\s+for\s+([\d\s]+(?:min(?:ute)?s?|m|h(?:ours?)?(?:\s*\d{1,2})?)))?\s+at\s+(.+?)\s*$/i;

export function parsePlanReply(text: string, ctx: PlanReplyContext): PlanIntent {
  const s = text.trim();
  if (!s) return { type: "unknown", reason: "empty reply" };

  let m = s.match(ADD_RE);
  if (m) {
    const time = parseTimeOfDay(m[3]);
    if (!time) return { type: "unknown", reason: `couldn't read a time in "${m[3]}"` };
    const minutes = (m[2] && parseDuration(m[2])) || DEFAULT_BLOCK_MINUTES;
    return { type: "add", title: m[1].trim(), ...toIsoRange(ctx, time, minutes) };
  }

  m = s.match(RESCHEDULE_RE);
  if (m) {
    const time = parseTimeOfDay(m[2]);
    if (!time) return { type: "unknown", reason: `couldn't read a time in "${m[2]}"` };
    const block = bestMatch(m[1], ctx.blocks, (b) => b.title);
    if (!block) return { type: "unknown", reason: `no tentative block matches "${m[1]}"` };
    return {
      type: "reschedule",
      eventId: block.eventId,
      blockTitle: block.title,
      ...toIsoRange(ctx, time, blockMinutes(block)),
    };
  }

  m = s.match(PLACE_RE);
  if (m) {
    const time = parseTimeOfDay(m[2]);
    if (!time) return { type: "unknown", reason: `couldn't read a time in "${m[2]}"` };
    // Placement questions win over blocks; "schedule <block> at X" still
    // resolves as a reschedule below.
    const placement = bestMatch(m[1], ctx.placements, (p) => p.content);
    if (placement) {
      return {
        type: "place",
        todoistId: placement.id,
        content: placement.content,
        ...toIsoRange(ctx, time, DEFAULT_BLOCK_MINUTES),
      };
    }
    const block = bestMatch(m[1], ctx.blocks, (b) => b.title);
    if (block) {
      return {
        type: "reschedule",
        eventId: block.eventId,
        blockTitle: block.title,
        ...toIsoRange(ctx, time, blockMinutes(block)),
      };
    }
    return { type: "unknown", reason: `nothing in today's plan matches "${m[1]}"` };
  }

  m = s.match(DECLINE_RE) ?? s.match(WONT_RE);
  if (m) {
    const block = bestMatch(m[1], ctx.blocks, (b) => b.title);
    if (!block) return { type: "unknown", reason: `no tentative block matches "${m[1]}"` };
    return { type: "decline", eventId: block.eventId, blockTitle: block.title };
  }

  return {
    type: "unknown",
    reason:
      'try: "push <block> to 6pm", "skip <block> today", "schedule <task> at 4pm", or "add <thing> at 5pm"',
  };
}

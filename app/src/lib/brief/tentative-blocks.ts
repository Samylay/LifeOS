// Pure scheduling logic for T23's tentative calendar blocks — see
// ~/loop-me/workflows/daily-planning.md "Prioritization" + "Calendar
// behavior". No I/O here; google-calendar.ts reads/writes, this module only
// decides what to place and when, so it's fixture-testable.
import { localTimeToUtcIso } from "./tz";

export const TENTATIVE_PREFIX = "〜 "; // "〜 "

export interface Busy {
  startIso: string;
  endIso: string;
}

export interface DynamicItem {
  centre: string;
  title: string;
}

export interface ProposedBlock {
  title: string;
  startIso: string;
  endIso: string;
}

const WORKOUT_HOUR = 6;
const WORKOUT_MINUTES = 60;
const PROTECTED_CENTRES = ["polymath", "software-engineering-learning"];
const PROTECTED_MINUTES = 30;
const WINDOW_START_HOUR = 7;
const WINDOW_END_HOUR = 22; // 10pm
const DYNAMIC_BLOCK_MINUTES = 30;
const SCAN_STEP_MS = 5 * 60_000;

interface Interval {
  start: number;
  end: number;
}

function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

function fits(candidate: Interval, busy: Interval[]): boolean {
  return !busy.some((b) => overlaps(candidate, b));
}

/** First `durationMin`-long free slot at or after `fromMs` and fully inside `[fromMs, untilMs)`. */
function placeNext(fromMs: number, untilMs: number, durationMin: number, busy: Interval[]): Interval | null {
  const durationMs = durationMin * 60_000;
  for (let start = fromMs; start + durationMs <= untilMs; start += SCAN_STEP_MS) {
    const candidate = { start, end: start + durationMs };
    if (fits(candidate, busy)) return candidate;
  }
  return null;
}

function toBlock(title: string, interval: Interval): ProposedBlock {
  return {
    title: `${TENTATIVE_PREFIX}${title}`,
    startIso: new Date(interval.start).toISOString(),
    endIso: new Date(interval.end).toISOString(),
  };
}

/**
 * Computes the day's proposed tentative blocks: the fixed 6am workout
 * anchor, then polymath/SWE-learning's protected 30-min minimums, then
 * `dynamicItems` (already priority-ranked by the caller) filling whatever's
 * left of the 7am-10pm window. Never overlaps `existing` (real calendar
 * events are hard constraints) or a block already placed earlier in the run.
 */
export function computeTentativeBlocks(opts: {
  dateStr: string;
  tz: string;
  existing: Busy[];
  dynamicItems: DynamicItem[];
}): ProposedBlock[] {
  const { dateStr, tz, existing, dynamicItems } = opts;
  const busy: Interval[] = existing.map((e) => ({ start: Date.parse(e.startIso), end: Date.parse(e.endIso) }));
  const blocks: ProposedBlock[] = [];

  const workout: Interval = {
    start: Date.parse(localTimeToUtcIso(dateStr, WORKOUT_HOUR, 0, tz)),
    end: Date.parse(localTimeToUtcIso(dateStr, WORKOUT_HOUR, 0, tz)) + WORKOUT_MINUTES * 60_000,
  };
  if (fits(workout, busy)) {
    blocks.push(toBlock("Workout", workout));
    busy.push(workout);
  }

  const windowStart = Date.parse(localTimeToUtcIso(dateStr, WINDOW_START_HOUR, 0, tz));
  const windowEnd = Date.parse(localTimeToUtcIso(dateStr, WINDOW_END_HOUR, 0, tz));

  for (const centre of PROTECTED_CENTRES) {
    const placed = placeNext(windowStart, windowEnd, PROTECTED_MINUTES, busy);
    if (!placed) continue;
    blocks.push(toBlock(centre, placed));
    busy.push(placed);
  }

  for (const item of dynamicItems) {
    const placed = placeNext(windowStart, windowEnd, DYNAMIC_BLOCK_MINUTES, busy);
    if (!placed) break; // window exhausted
    blocks.push(toBlock(item.title, placed));
    busy.push(placed);
  }

  return blocks;
}

// Pure selection logic for the /prime rework (prime-rework ticket 01).
//
// `/prime` had 10 sessions and 0 completions — a structural failure, not a
// motivational one (see .scratch/prime-rework/spec.md). The fix is to make
// "what shows today" pure exposure: a deterministic function of the date and
// the bank, with no field anywhere that a session, an acknowledgement, or a
// streak could be hung off. `primeFor` never touches the network, a
// database, or the filesystem, and its tests need none of those either — the
// bank is always passed in by the caller, which reads the live doc store
// (`affirmationBank` / `principles`, per docs/agents/domain.md) at the top
// of the call stack, nowhere near this file.
//
// Anchors show every day, unconditionally. Rotating affirmations and the
// principle-of-the-day cycle through a *circular round-robin* keyed off the
// date, not a per-day random pick: over one full cycle through the bank,
// every active item appears exactly `slots` times, so nothing dominates and
// nothing starves. The window's start point comes from a whole-cycle
// permutation seeded by the item count (stable across dates), then walked by
// day index — so consecutive days show different items, but which items
// share a day is still deterministic and reproducible after a restart.

export type PrimeAffirmationType = "anchor" | "rotating" | "contextual";

export interface PrimeBankAffirmation {
  text: string;
  type: PrimeAffirmationType;
  active: boolean;
}

export interface PrimeBankPrinciple {
  text: string;
  active: boolean;
}

export interface PrimeBank {
  affirmations: PrimeBankAffirmation[];
  principles: PrimeBankPrinciple[];
}

// The full returned shape. This is the structural contract the ticket exists
// to protect: no id, no acknowledged, no completedAt, no streak — a practice
// with no completion state is a practice that cannot be failed. See
// prime-selection.test.ts's "structural: no completion state" block, which
// fails (at the type level, via `expectTypeOf`, and at the key-set level, at
// runtime) the moment any such field is added here.
export interface PrimeSelection {
  date: string;
  anchors: string[];
  rotating: string[];
  principle?: string;
}

const ROTATING_SLOTS = 2;
const PRINCIPLE_SLOTS = 1;

/** Stable FNV-1a hash from a string — deterministic across process restarts. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Days since the Unix epoch for a `YYYY-MM-DD` string, computed via UTC
 * fields only (no local timezone, no locale, no `Date.now()`) so the same
 * date string always yields the same integer.
 */
function dayIndexFor(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Math.floor(Date.UTC(y, (m || 1) - 1, d || 1) / 86_400_000);
}

/**
 * A fixed (date-independent) permutation of `[0, n)`, seeded only by `n` and
 * `seed` — deterministic and reused for every date so the *order* items
 * cycle in never itself changes day to day, only the window into it does.
 */
function stablePermutation(n: number, seed: string): number[] {
  const order = Array.from({ length: n }, (_, i) => i);
  // Deterministic Fisher-Yates: draw the "random" swap index from a hash of
  // (seed, position) instead of Math.random.
  for (let i = n - 1; i > 0; i--) {
    const j = hash(`${seed}:${i}`) % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

/**
 * Picks `slots` items out of `items` for `dayIndex`, cycling fairly: over any
 * `items.length` consecutive day indices, every item is chosen exactly
 * `min(slots, items.length)` times. Returns items in bank order (not
 * permutation order) so the same pair always reads the same way when it
 * recurs.
 */
function circularPick<T>(items: T[], dayIndex: number, slots: number, seed: string): T[] {
  if (items.length === 0) return [];
  const take = Math.min(slots, items.length);
  const order = stablePermutation(items.length, seed);
  const start = ((dayIndex % items.length) + items.length) % items.length;
  const chosenPositions = new Set<number>();
  for (let k = 0; k < take; k++) {
    chosenPositions.add(order[(start + k) % items.length]);
  }
  // Preserve original bank order among the chosen items.
  return items.filter((_, i) => chosenPositions.has(i));
}

/**
 * The one seam this ticket adds: a pure function of `date` and `bank`. Same
 * date and same bank always produce the same `PrimeSelection`, including
 * after a restart — there is nothing stateful to warm up.
 */
export function primeFor(date: string, bank: PrimeBank): PrimeSelection {
  const dayIndex = dayIndexFor(date);

  const anchors = bank.affirmations.filter((a) => a.active && a.type === "anchor").map((a) => a.text);

  // "rotating" and "contextual" are both non-anchor content that rotates in;
  // the returned shape only distinguishes anchor vs. everything else.
  const rotatingPool = bank.affirmations.filter((a) => a.active && a.type !== "anchor");
  const rotating = circularPick(rotatingPool, dayIndex, ROTATING_SLOTS, "rotating").map((a) => a.text);

  const activePrinciples = bank.principles.filter((p) => p.active);
  const principle = circularPick(activePrinciples, dayIndex, PRINCIPLE_SLOTS, "principle")[0]?.text;

  return { date, anchors, rotating, principle };
}

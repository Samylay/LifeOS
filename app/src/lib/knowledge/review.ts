// Review selection — the pure rule that decides which review cards Samy sees
// right now, and why each one is in front of him.
//
// Spec: .scratch/knowledge-rework/spec.md, ticket 01
// (.scratch/knowledge-rework/issues/01-review-selection-module.md).
//
// The house law this module exists to enforce: extraction is SELECTION,
// never generation. A card's text is always a verbatim slice of the saved
// item's own text, sliced at the recorded offsets by this module itself —
// there is no code path that lets a card's quote diverge from its source,
// because the only way to build a ReviewCard is buildCard() below, and it
// only ever slices. Two prior verticals (/feed, /content) died of an LLM
// authoring or paraphrasing words instead of choosing them; this module
// makes that mistake structurally unavailable rather than merely discouraged.
//
// No filesystem, no database, no network, no model call. Callers gather the
// saved items and the review state (however they're persisted); this module
// only ever decides what they mean. That split is what makes "which cards
// are due" answerable against fixtures instead of a running app — same
// reasoning as projects/state.ts and decide/actions.ts.

/** A saved item as this module needs it — the source text plus the passage
 * already selected from it. Selection happens upstream (Samy saving a
 * passage, or an agent CHOOSING a span) and is handed in already made; this
 * module never chooses a span itself, only whether to show the one it was
 * given. */
export interface SavedItem {
  id: string;
  title: string;
  url: string;
  text: string;
  /** The span of `text` to quote. Offsets, not a copy of the string — the
   * quote is always derived by slicing `text`, never stored independently,
   * so it cannot drift from its source. */
  passage: { start: number; end: number };
}

/** The decision this module exists to produce. `sourceItemId` is required —
 * there is no variant of this type that omits it, so a card without
 * provenance cannot be represented, let alone constructed. */
export interface ReviewCard {
  sourceItemId: string;
  quote: string;
  start: number;
  end: number; // start + quote.length, always — see buildCard
  attribution: { title: string; url: string };
}

/** One saved item's review history. `dismissed` is a one-way door: once set,
 * nothing in this module ever reads the rest of the record for that item
 * again. `lastShownAt` / `intervalIndex` drive spacing for everything else. */
export interface ReviewRecord {
  sourceItemId: string;
  dismissed: boolean;
  lastShownAt: number | null; // epoch ms; null = never shown, due immediately
  intervalIndex: number; // rung into INTERVALS_DAYS
}

export type ReviewState = ReviewRecord[];

/** Resurfacing spacing, in days, indexed by `intervalIndex`. Inherited from
 * /feed's SM-2-lite ladder (spec: "review layer, inherited from /feed") —
 * same law, new surface. Load-bearing: tests assert this verbatim and probe
 * the boundary on either side of every rung, so changing it is a deliberate,
 * visible act, not a silent drift. */
export const INTERVALS_DAYS = [1, 3, 7, 21] as const;

const DAY_MS = 24 * 60 * 60 * 1000;

export type ReviewOutcome = "remembered" | "forgot";

/** Builds a card by slicing the item's own text at its own recorded
 * offsets — the only place a ReviewCard is ever constructed. There is no
 * other function, in this module or any caller, that can produce one. */
function buildCard(item: SavedItem): ReviewCard {
  const { start, end } = item.passage;
  return {
    sourceItemId: item.id,
    quote: item.text.slice(start, end),
    start,
    end,
    attribution: { title: item.title, url: item.url },
  };
}

/** Whether a record's item is due at `nowMs`. A missing record, or one that
 * has never been shown, means first exposure — due immediately, since only
 * material Samy explicitly saved reaches this module at all (there is no
 * "cold" backlog to ration). A dismissed record is never due, at any time. */
export function isDue(record: ReviewRecord | undefined, nowMs: number): boolean {
  if (!record) return true; // first exposure — nothing to wait on
  if (record.dismissed) return false; // permanent, regardless of spacing
  if (record.lastShownAt === null) return true;
  const rung = Math.min(Math.max(record.intervalIndex, 0), INTERVALS_DAYS.length - 1);
  return record.lastShownAt + INTERVALS_DAYS[rung] * DAY_MS <= nowMs;
}

/** The rule: given what Samy saved, what he's already seen or dismissed, and
 * the current time, which cards are due right now. Returns an empty array —
 * never a placeholder — when nothing deserves resurfacing. */
export function dueCards(
  savedItems: SavedItem[],
  reviewState: ReviewState,
  nowMs: number
): ReviewCard[] {
  const bySourceId = new Map(reviewState.map((r) => [r.sourceItemId, r]));
  const cards: ReviewCard[] = [];
  for (const item of savedItems) {
    const record = bySourceId.get(item.id);
    if (record?.dismissed) continue;
    if (!isDue(record, nowMs)) continue;
    cards.push(buildCard(item));
  }
  return cards;
}

/** SM-2-lite: remembering advances one rung (capped at the ladder's end),
 * forgetting resets to the first. Mirrors feed.ts's nextIntervalIndex — same
 * law, new surface. Pure: callers persist the result onto the item's
 * ReviewRecord (new intervalIndex, lastShownAt = now) themselves. */
export function nextInterval(intervalIndex: number, outcome: ReviewOutcome): number {
  if (outcome === "forgot") return 0;
  return Math.min(intervalIndex + 1, INTERVALS_DAYS.length - 1);
}

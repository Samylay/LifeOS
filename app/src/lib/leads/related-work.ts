// Related-work lookup — the "his own relevant prior work" half of ticket 03.
// Pulls from what LifeOS already holds (the Obsidian vault Hermes enriches,
// searched via lib/kb.ts's FTS index) rather than inventing a new store to
// maintain: a hand-kept list of past projects would be manual entry by
// another name, and the product law here is "no manual entry, nothing
// unbounded".
//
// This module stays pure and I/O-free on purpose — the caller (the
// /api/leads route) injects the actual search function (kb.ts's
// searchNotes), so "which notes would this lead surface" is testable
// against a fake search with no vault or SQLite involved.
//
// Deliberately never falls back to kb.ts's "closest other notes" suggestions
// (its zero-match fallback for the /knowledge search box, meant to help a
// human refine a query). Handing a lead card something "loosely related"
// when nothing actually matched is exactly the padding ticket 03 rules out —
// quiet beats padding.

export interface RelatedWorkNote {
  path: string;
  title: string;
  summary?: string;
}

/** Matches the shape of lib/kb.ts's SearchResult without importing it — that
 * module touches the filesystem; this one must stay free of any I/O. */
export type NoteSearcher = (query: string, limit: number) => { notes: RelatedWorkNote[] };

export interface RelatedWorkSubject {
  counterparty: string;
  requirement: string;
}

/** Never more than this many notes on a card — a "handful" applies here too. */
export const RELATED_WORK_LIMIT = 3;

/** What text names this lead well enough to search the vault with. Both
 * fields blank means there is nothing to search for at all. */
export function relatedWorkQuery(subject: RelatedWorkSubject): string {
  return [subject.counterparty, subject.requirement]
    .filter((s) => s.trim().length > 0)
    .join(" ")
    .trim();
}

/**
 * Samy's prior work relevant to this lead, or an empty list. An empty result
 * here is exactly what tells the card to stay quiet (ticket 03's fourth
 * checkbox) — it is never backfilled with unrelated recent notes.
 */
export function selectRelatedWork(
  subject: RelatedWorkSubject,
  search: NoteSearcher,
  limit: number = RELATED_WORK_LIMIT,
): RelatedWorkNote[] {
  const query = relatedWorkQuery(subject);
  if (!query) return [];
  const { notes } = search(query, limit);
  return notes.slice(0, limit).map((n) => ({ path: n.path, title: n.title, summary: n.summary }));
}

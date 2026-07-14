// One-off pain-point deck (2026-07-14).
//
// 391 Hacker News comments were pulled by searching for the literal phrases
// people type when they are annoyed or spending money ("I would happily pay",
// "by hand every", "we pay someone to"). The 112 in the paying bucket land
// here for Samy to read.
//
// THE ONE RULE THIS DECK EXISTS TO ENFORCE: no card carries a pre-written
// verdict. Every other deck in /decide shows an LLM's assessment and asks Samy
// to approve it — correct there, fatal here. Three rounds of SaaS gap research
// (54 gaps, 2 finalists deep-dived, both no-go) failed for exactly one reason:
// agents read vendor content, formed verdicts, and the willingness-to-pay
// evidence turned out to be manufactured. So a PainItem holds verbatim text
// and nothing else — the swipe IS the first judgment made on it.
//
// Read for CURRENT spend, not hypothetical spend. "I'd pay for a good X" with
// nobody currently paying anything is a wish. "We pay a guy $400/mo" is a
// signal — across all three rounds, "people already pay humans to do this" was
// the only screening signal that survived deep-dive.
//
// Like the bookmark shelf, this collection is disposable: when the deck is
// empty the read-through is done and the tab stops existing.

export const PAIN_COLLECTION = "users/local/painDeck";

export type PainStatus = "pending" | "kept" | "dropped";

/** A surrounding comment — the thread context, verbatim. */
export interface PainQuote {
  by: string;
  text: string;
  url: string;
}

export interface PainItem {
  id: string;
  /** Only "hn" today; Reddit is blocked on an API app (see demand_scout). */
  source: string;
  /** Source-native id, e.g. the HN comment id. Dedup key with `source`. */
  extId: string;
  url: string;
  author: string;
  saidAt: { __date?: string } | string;
  /** The comment itself. Never truncated, never summarised. */
  text: string;
  /** The literal search phrase that matched. Provenance, not a category. */
  phrase: string;
  storyTitle: string;
  storyUrl: string;
  /** Post body when the thread is an Ask HN — the actual initial ask. */
  storyText: string;
  /** What they were replying to, oldest first. */
  ancestors: PainQuote[];
  /** Direct replies. Often "that exists, it's called Y" = free disqualification. */
  replies: PainQuote[];
  status: PainStatus;
}

/** Dedup key: re-running the seeder must not stack duplicate cards. */
export function painKey(source: string, extId: string): string {
  return `${source.trim().toLowerCase()}:${String(extId).trim()}`;
}

/** Tolerates the `{__date}` marker the doc store round-trips dates through. */
export function isoOf(v: PainItem["saidAt"]): string {
  return (typeof v === "string" ? v : v?.__date) ?? "";
}

/** Trim context quotes for display; the matched comment is never clamped. */
export function clampQuote(text: string, max = 700): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max).replace(/\s+\S*$/, "")} […]`;
}

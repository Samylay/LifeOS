// One-off pre-stage for the Firefox bookmark shelf (2026-07-14).
//
// The nightly grabber only carries NEW bookmarks. The 227-item backlog behind
// it is a different kind of object: a four-year library where most rows are
// reference material Samy deliberately parked, not things awaiting a verdict.
// Running the full study step over it would spend a content fetch + an Opus
// call on 2023 links that are dead or obsolete before he ever saw them.
//
// So `backfill-firefox.py` culls it first on metadata alone — title, URL,
// folder, age, and whether the link still resolves — and only its proposed
// DROPS reach this deck. High-confidence keeps are ingested silently into the
// normal pipeline; Samy reviews what the cull wants to throw away, so nothing
// leaves the shelf without his say-so.
//
// Dead links are FLAGGED, never auto-dropped (Samy, 2026-07-14): some are
// worth an archive.org lookup, and that is his call to make.
//
// This collection is disposable. When the deck is empty the backfill is done.

export const BACKFILL_COLLECTION = "users/local/bookmarkBackfill";

export type BackfillStatus = "pending" | "dropped" | "kept";

export interface BackfillItem {
  id: string;
  url: string;
  title: string;
  folder: string;
  savedAt: Date;
  /** false = the HEAD check could not reach it (404, dead domain, timeout). */
  alive: boolean;
  /** HTTP status from the liveness probe, or 0 when the request never landed. */
  httpStatus: number;
  /** Opus's metadata-only call. Only "drop" rows are surfaced for review. */
  verdict: "keep" | "drop";
  /** One line. The deck is meant to be ruled on at a glance. */
  why: string;
  status: BackfillStatus;
  createdAt: Date;
}

/** Bare host, for the card's at-a-glance line. Falsy input never throws. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url.slice(0, 40);
  }
}

/**
 * Coarse age label ("3y", "8mo", "12d"). Age is the whole point of this deck —
 * a 2022 bookmark carries different weight than last month's — so it reads as
 * a glanceable chip rather than a date the eye has to subtract from today.
 */
export function ageLabel(savedAt: string | Date, now: Date = new Date()): string {
  const then = typeof savedAt === "string" ? new Date(savedAt) : savedAt;
  const ms = now.getTime() - then.getTime();
  if (!Number.isFinite(ms) || ms < 0) return "";
  const days = Math.floor(ms / 86_400_000);
  if (days < 1) return "today";
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;
  return `${Math.floor(days / 365)}y`;
}

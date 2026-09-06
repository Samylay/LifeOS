// Sync-staleness logic for /finance (finance-rework ticket 02). The spec's
// framing is blunt: a surface showing months-old numbers as current is the
// failure this rework exists to prevent, so "is this stale" and "how do I
// say so in words Samy can read without converting a timestamp" are both
// pure, tested functions rather than something reimplemented inline in JSX.
//
// Pure module: no I/O, no bank-db import (bank-db pulls in better-sqlite3,
// which breaks a client bundle) — same split already used for consent in
// bank-consent-tripwire.ts (pure) vs bank-consent-notify.ts (DB-touching).
// `getBankSyncState("last_sync_at")` is a millisecond epoch string (see
// bank-sync.ts); callers parse it to a number before calling in here.

/**
 * Sync here is manual-trigger only (T69's deliberate scope — no scheduler),
 * so "stale" can't mean "missed a scheduled run". 48 hours is chosen as the
 * point past which numbers are more likely wrong than right for someone
 * checking burn day-to-day, while not nagging him for skipping a single day.
 */
export const SYNC_STALE_AFTER_MS = 48 * 60 * 60 * 1000;

/** No recorded sync at all is the most stale a surface can be — never reads
 * as "current" by omission. */
export function isSyncStale(lastSyncAt: number | null, now: number = Date.now()): boolean {
  if (lastSyncAt === null) return true;
  return now - lastSyncAt > SYNC_STALE_AFTER_MS;
}

/** "Synced 5 days ago" — never a raw ISO timestamp or epoch number, per the
 * ticket's "in terms he can read without converting a timestamp". */
export function formatLastSynced(lastSyncAt: number | null, now: number = Date.now()): string {
  if (lastSyncAt === null) return "Never synced";
  const deltaMs = Math.max(0, now - lastSyncAt);
  const minutes = Math.floor(deltaMs / 60_000);
  if (minutes < 1) return "Synced just now";
  if (minutes < 60) return `Synced ${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Synced ${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `Synced ${days} day${days === 1 ? "" : "s"} ago`;
}

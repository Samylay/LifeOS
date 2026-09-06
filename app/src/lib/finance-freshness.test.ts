// Pure staleness/formatting logic for the /finance "when did this last sync"
// banner (finance-rework ticket 02). No I/O, no bank-db import — mirrors the
// split already used for consent (bank-consent-tripwire.ts is the pure half,
// bank-consent-notify.ts is the DB-touching half).
import { describe, it, expect } from "vitest";
import { formatLastSynced, isSyncStale, SYNC_STALE_AFTER_MS } from "./finance-freshness";

describe("isSyncStale", () => {
  const now = Date.parse("2026-09-06T12:00:00Z");

  it("is stale when there has never been a sync", () => {
    expect(isSyncStale(null, now)).toBe(true);
  });

  it("is not stale just after a sync", () => {
    expect(isSyncStale(now - 60_000, now)).toBe(false);
  });

  it("is not stale right up to the threshold", () => {
    expect(isSyncStale(now - (SYNC_STALE_AFTER_MS - 1), now)).toBe(false);
  });

  it("is stale once the threshold is crossed", () => {
    expect(isSyncStale(now - (SYNC_STALE_AFTER_MS + 1), now)).toBe(true);
  });

  it("is stale for a sync from months ago — the exact failure mode this exists to catch", () => {
    const monthsAgo = Date.parse("2026-03-05T00:00:00Z");
    expect(isSyncStale(monthsAgo, now)).toBe(true);
  });
});

describe("formatLastSynced", () => {
  const now = Date.parse("2026-09-06T12:00:00Z");

  it("reads as 'Never synced' with no recorded sync", () => {
    expect(formatLastSynced(null, now)).toBe("Never synced");
  });

  it("reads in minutes for a very recent sync", () => {
    expect(formatLastSynced(now - 5 * 60_000, now)).toBe("Synced 5 minutes ago");
  });

  it("reads as 'just now' for a sub-minute-old sync", () => {
    expect(formatLastSynced(now - 10_000, now)).toBe("Synced just now");
  });

  it("reads in hours once past 60 minutes", () => {
    expect(formatLastSynced(now - 3 * 3_600_000, now)).toBe("Synced 3 hours ago");
  });

  it("reads in singular hour correctly", () => {
    expect(formatLastSynced(now - 3_600_000, now)).toBe("Synced 1 hour ago");
  });

  it("reads in days once past 24 hours — the range that matters for staleness", () => {
    const fiveDaysAgo = now - 5 * 86_400_000;
    expect(formatLastSynced(fiveDaysAgo, now)).toBe("Synced 5 days ago");
  });

  it("reads singular day correctly", () => {
    expect(formatLastSynced(now - 86_400_000, now)).toBe("Synced 1 day ago");
  });
});

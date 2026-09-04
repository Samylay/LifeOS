import { describe, it, expect } from "vitest";
import { FRESH_MS, SnapshotCache, isStale } from "./snapshot";

const NOW = new Date("2026-09-04T12:00:00.000Z");
const agoMs = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const tick = () => new Promise((r) => setTimeout(r, 0));

describe("isStale — a stamp that lies is worse than no data", () => {
  it("fresh inside the window, stale past it", () => {
    expect(isStale(agoMs(FRESH_MS - 1000), NOW)).toBe(false);
    expect(isStale(agoMs(FRESH_MS + 1000), NOW)).toBe(true);
  });

  it("never computed is stale", () => {
    expect(isStale(null, NOW)).toBe(true);
  });

  it("an unreadable stamp is stale, never trusted as current", () => {
    expect(isStale("not a date", NOW)).toBe(true);
  });
});

describe("SnapshotCache — a request never waits on a scan", () => {
  it("returns immediately before any scan has finished, and says so", () => {
    const cache = new SnapshotCache(() => ["a"]);
    const snap = cache.read(NOW);
    expect(snap.computing).toBe(true);
    expect(snap.projects).toEqual([]);
    expect(snap.computedAt).toBeNull();
  });

  it("serves the scan once it lands, with its computed-at stamp", async () => {
    const cache = new SnapshotCache(() => ["a", "b"]);
    await cache.refresh();
    const snap = cache.read(new Date());
    expect(snap.projects).toEqual(["a", "b"]);
    expect(snap.computing).toBe(false);
    expect(snap.stale).toBe(false);
    expect(snap.computedAt).not.toBeNull();
  });

  it("serves stale data rather than nothing, and marks it stale", async () => {
    let value = "first";
    const cache = new SnapshotCache(() => [value], 1000);
    await cache.refresh();
    value = "second";
    // Read from far enough in the future that the snapshot has certainly aged
    // out — asserting on wall-clock timing would just make this flaky.
    const snap = cache.read(new Date(Date.now() + 60_000));
    expect(snap.projects).toEqual(["first"]);
    expect(snap.stale).toBe(true);
  });

  it("keeps the last good snapshot when a scan throws", async () => {
    let boom = false;
    const cache = new SnapshotCache(() => {
      if (boom) throw new Error("git exploded");
      return ["good"];
    });
    await cache.refresh();
    boom = true;
    await cache.refresh();
    expect(cache.read(new Date()).projects).toEqual(["good"]);
  });

  it("does not run overlapping scans", async () => {
    let runs = 0;
    const cache = new SnapshotCache(() => { runs++; return [runs]; }, 1000);
    // Several reads while stale must not pile scans on top of each other.
    const later = new Date(Date.now() + 60_000);
    cache.read(later); cache.read(later); cache.read(later);
    await tick();
    expect(runs).toBeLessThanOrEqual(2);
  });
});

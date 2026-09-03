import { describe, it, expect } from "vitest";
import { DEFER_DAYS, deferUntilFrom, isDue, visibleQueueItems } from "./queue";

const NOW = new Date("2026-09-03T12:00:00.000Z");
const d = (iso: string) => ({ __date: iso });

describe("deferring is a real answer, not abandonment", () => {
  it("a deferred card comes back on a defined date", () => {
    const until = deferUntilFrom(NOW);
    expect(new Date(until).getTime() - NOW.getTime()).toBe(DEFER_DAYS * 24 * 60 * 60 * 1000);
  });

  it("hides a deferred card until its date, then shows it again", () => {
    const item = { status: "deferred", deferUntil: d("2026-09-10T12:00:00.000Z") };
    expect(isDue(item, NOW)).toBe(false);
    expect(isDue(item, new Date("2026-09-10T11:59:00.000Z"))).toBe(false);
    expect(isDue(item, new Date("2026-09-10T12:00:00.000Z"))).toBe(true);
    expect(isDue(item, new Date("2026-09-11T00:00:00.000Z"))).toBe(true);
  });

  it("shows proposed cards regardless of any stale defer date", () => {
    expect(isDue({ status: "proposed", deferUntil: d("2099-01-01T00:00:00.000Z") }, NOW)).toBe(true);
  });

  it("never shows filed, discarded or done cards", () => {
    for (const status of ["filed", "discarded", "done", "queued"]) {
      expect(isDue({ status }, NOW)).toBe(false);
    }
  });

  it("a malformed defer date shows the card rather than losing it", () => {
    expect(isDue({ status: "deferred", deferUntil: d("not a date") }, NOW)).toBe(true);
    expect(isDue({ status: "deferred" }, NOW)).toBe(true);
  });

  it("orders the visible deck oldest first, deferred cards interleaved by age", () => {
    const items = [
      { id: "new", status: "proposed", createdAt: d("2026-08-30T00:00:00.000Z") },
      { id: "old-deferred", status: "deferred", createdAt: d("2026-08-01T00:00:00.000Z"), deferUntil: d("2026-09-01T00:00:00.000Z") },
      { id: "still-deferred", status: "deferred", createdAt: d("2026-08-02T00:00:00.000Z"), deferUntil: d("2026-12-01T00:00:00.000Z") },
      { id: "oldest", status: "proposed", createdAt: d("2026-07-01T00:00:00.000Z") },
    ];
    expect(visibleQueueItems(items, NOW).map((i) => i.id)).toEqual([
      "oldest",
      "old-deferred",
      "new",
    ]);
  });
});

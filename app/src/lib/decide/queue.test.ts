import { describe, it, expect } from "vitest";
import { DEFER_DAYS, deferUntilFrom, dispatchableItems, isDue, visibleQueueItems } from "./queue";

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

describe("dispatchableItems — bounded, so the list never becomes a backlog", () => {
  const filed = (id: string, iso: string, status = "filed") => ({
    id, status, filedAt: d(iso),
  });

  it("offers items filed inside the window, newest first", () => {
    const items = [
      filed("a", "2026-08-30T00:00:00.000Z"),
      filed("b", "2026-09-02T00:00:00.000Z"),
      filed("c", "2026-08-29T00:00:00.000Z"),
    ];
    expect(dispatchableItems(items, [], NOW).map((i) => i.id)).toEqual(["b", "a", "c"]);
  });

  it("drops anything older than the window — filing was the action", () => {
    const items = [filed("old", "2026-08-01T00:00:00.000Z"), filed("new", "2026-09-01T00:00:00.000Z")];
    expect(dispatchableItems(items, [], NOW).map((i) => i.id)).toEqual(["new"]);
  });

  it("drops items already queued for Claude, so nothing is queued twice", () => {
    const items = [filed("a", "2026-09-02T00:00:00.000Z"), filed("b", "2026-09-02T00:00:00.000Z")];
    expect(dispatchableItems(items, ["a"], NOW).map((i) => i.id)).toEqual(["b"]);
  });

  it("only filed items are dispatchable", () => {
    const items = [
      filed("p", "2026-09-02T00:00:00.000Z", "proposed"),
      filed("dsc", "2026-09-02T00:00:00.000Z", "discarded"),
      filed("done", "2026-09-02T00:00:00.000Z", "done"),
      filed("f", "2026-09-02T00:00:00.000Z"),
    ];
    expect(dispatchableItems(items, [], NOW).map((i) => i.id)).toEqual(["f"]);
  });

  it("excludes an item with no readable filedAt rather than showing it forever", () => {
    expect(dispatchableItems([{ id: "x", status: "filed" }], [], NOW)).toEqual([]);
    expect(dispatchableItems([{ id: "y", status: "filed", filedAt: d("nope") }], [], NOW)).toEqual([]);
  });
});

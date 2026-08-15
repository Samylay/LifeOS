import { describe, it, expect, afterEach } from "vitest";
import { toggledHabitState } from "./use-habits";

// Node reads process.env.TZ live, so each block can pick its own zone.
const originalTz = process.env.TZ;
afterEach(() => {
  process.env.TZ = originalTz;
});

describe("toggledHabitState — civil-day keys", () => {
  it("stamps a tick after midnight with today, not yesterday's UTC date", () => {
    process.env.TZ = "Europe/Paris";
    // 00:30 Paris on the 16th is 22:30Z on the 15th. The old UTC key wrote 15.
    const now = new Date("2026-08-15T22:30:00Z");
    const { history } = toggledHabitState([], now);
    expect(history).toEqual([{ date: "2026-08-16", completed: true }]);
  });

  it("counts today in the streak (the bug: today was never counted)", () => {
    process.env.TZ = "Europe/Paris";
    const now = new Date("2026-08-15T09:00:00Z"); // 11:00 Paris on the 15th
    const { streak } = toggledHabitState(
      [
        { date: "2026-08-13", completed: true },
        { date: "2026-08-14", completed: true },
      ],
      now
    );
    expect(streak).toBe(3); // 13, 14, and today's fresh 15
  });

  it("holds in a zone ahead of Paris too", () => {
    process.env.TZ = "Asia/Tokyo";
    const now = new Date("2026-08-15T15:30:00Z"); // 00:30 JST on the 16th
    const { history, streak } = toggledHabitState(
      [{ date: "2026-08-15", completed: true }],
      now
    );
    expect(history.at(-1)).toEqual({ date: "2026-08-16", completed: true });
    expect(streak).toBe(2);
  });

  it("untoggles an existing entry and drops it out of the streak", () => {
    process.env.TZ = "Europe/Paris";
    const now = new Date("2026-08-15T09:00:00Z");
    const { history, streak } = toggledHabitState(
      [
        { date: "2026-08-14", completed: true },
        { date: "2026-08-15", completed: true },
      ],
      now
    );
    expect(history).toContainEqual({ date: "2026-08-15", completed: false });
    expect(streak).toBe(0); // today is now missing, so the count stops at once
  });

  it("stops at a gap instead of counting every completed day", () => {
    process.env.TZ = "Europe/Paris";
    const now = new Date("2026-08-15T09:00:00Z");
    const { streak } = toggledHabitState(
      [
        { date: "2026-08-10", completed: true },
        { date: "2026-08-11", completed: true },
        { date: "2026-08-14", completed: true },
      ],
      now
    );
    expect(streak).toBe(2); // 15 and 14, then the 12-13 gap
  });

  it("crosses a month boundary", () => {
    process.env.TZ = "Europe/Paris";
    const now = new Date("2026-09-01T09:00:00Z");
    const { streak } = toggledHabitState(
      [
        { date: "2026-08-30", completed: true },
        { date: "2026-08-31", completed: true },
      ],
      now
    );
    expect(streak).toBe(3);
  });
});

import { describe, expect, it } from "vitest";
import { parseHabit } from "./habit-schedule";
import type { Habit } from "./types";

const base = { id: "h1", name: "Read", frequency: "daily", streak: 2 } as const;
const habit = (history: unknown, extra: Record<string, unknown> = {}) => ({ ...base, history, ...extra }) as unknown as Habit;

describe("parseHabit", () => {
  it.each([[{}], [null], ["x"], [42], [undefined]])("turns a non-array history (%j) into an empty one", (history) => {
    const parsed = parseHabit(habit(history));
    expect(parsed.history).toEqual([]);
    expect(parsed.history.some((entry) => entry.completed)).toBe(false);
  });

  it("drops history entries of the wrong shape and keeps valid ones", () => {
    const parsed = parseHabit(habit([{ date: "2026-10-16", completed: true }, null, "x", { date: 5, completed: true }, { date: "2026-10-15" }]));
    expect(parsed.history).toEqual([{ date: "2026-10-16", completed: true }]);
  });

  it("returns a valid habit unchanged, by reference", () => {
    const valid = habit([{ date: "2026-10-16", completed: false }]);
    expect(parseHabit(valid)).toBe(valid);
  });

  it("replaces a non-numeric streak with 0", () => {
    expect(parseHabit(habit([], { streak: "lots" })).streak).toBe(0);
  });
});

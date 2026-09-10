import { describe, it, expect } from "vitest";
import type { Habit } from "./types";
import { habitEdit, habitDue, habitCompleted, scheduledToggle, sortHabits } from "./habit-schedule";

const habit = (patch: Partial<Habit> = {}): Habit => ({ id: "read", name: "Read", frequency: "daily", history: [], streak: 0, ...patch });

describe("habit management preserves identity and history", () => {
  it("edits only the name and schedule", () => {
    const original = habit({ history: [{ date: "2026-09-07", completed: true }], streak: 8 });
    const edited = { ...original, ...habitEdit(" New name ", "custom", [5, 1, 1]) };
    expect(edited.name).toBe("New name");
    expect(edited.daysOfWeek).toEqual([1, 5]);
    expect(edited.id).toBe(original.id);
    expect(edited.history).toBe(original.history);
    expect(edited.streak).toBe(8);
    expect(() => habitEdit("  ", "daily", [])).toThrow();
    expect(() => habitEdit("Read", "custom", [99])).toThrow();
  });
  it("keeps legacy daily habits visible, respects selected days and hides inactive ones", () => {
    const monday = new Date(2026, 8, 7, 10);
    expect(habitDue(habit(), monday)).toBe(true);
    expect(habitDue(habit({ daysOfWeek: [2, 4] }), monday)).toBe(false);
    expect(habitDue(habit({ daysOfWeek: [1] }), monday)).toBe(true);
    expect(habitDue(habit({ status: "paused" }), monday)).toBe(false);
    expect(habitDue(habit({ status: "archived" }), monday)).toBe(false);
  });
  it("reorders one habit without needing to rewrite the others", () => {
    const original = [habit({ id: "a" }), habit({ id: "b" }), habit({ id: "c" })];
    expect(sortHabits(original).map((h) => h.id)).toEqual(["a", "b", "c"]);
    expect(sortHabits(original.map((h) => h.id === "c" ? { ...h, order: -1 } : h)).map((h) => [h.id, h.order])).toEqual([["c", -1], ["a", 0], ["b", 1]]);
  });
});

describe("scheduled completion", () => {
  it("shows a weekly completion all week and undoes its original day", () => {
    const weekly = habit({ frequency: "weekly", history: [{ date: "2026-09-07", completed: true }] });
    expect(habitCompleted(weekly, new Date(2026, 8, 13, 10))).toBe(true);
    expect(habitCompleted(weekly, new Date(2026, 8, 14, 10))).toBe(false);
    expect(scheduledToggle(weekly, new Date(2026, 8, 10, 10)).history).toEqual([{ date: "2026-09-07", completed: false }]);
  });
  it("counts completed weeks rather than consecutive days", () => {
    const weekly = habit({ frequency: "weekly", history: [{ date: "2026-08-30", completed: true }, { date: "2026-09-02", completed: true }] });
    expect(scheduledToggle(weekly, new Date(2026, 8, 10, 10)).streak).toBe(3);
  });
  it("skips unscheduled days in a streak", () => {
    const custom = habit({ daysOfWeek: [1, 3, 5], history: [{ date: "2026-09-04", completed: true }, { date: "2026-09-07", completed: true }] });
    expect(scheduledToggle(custom, new Date(2026, 8, 9, 10)).streak).toBe(3);
    expect(scheduledToggle({ ...custom, history: [custom.history[0]] }, new Date(2026, 8, 9, 10)).streak).toBe(1);
  });
});

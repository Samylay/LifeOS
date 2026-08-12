import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { isOverdue, isDueToday } from "./use-reminders";
import type { Reminder } from "./types";

function reminder(dueDate: Date): Reminder {
  return {
    id: "r1",
    title: "test",
    frequency: "once",
    dueDate,
    completed: false,
    createdAt: dueDate,
  };
}

describe("isOverdue / isDueToday agree on the same civil day (JST)", () => {
  const originalTz = process.env.TZ;

  beforeEach(() => {
    process.env.TZ = "Asia/Tokyo";
  });

  afterEach(() => {
    process.env.TZ = originalTz;
    vi.useRealTimers();
  });

  it("a reminder due today (JST) is due-today and not overdue, even though its UTC date differs from 'now's UTC date", () => {
    // dueDate is JST 2026-08-13 00:00, which is 2026-08-12T15:00:00Z.
    const dueDate = new Date("2026-08-12T15:00:00Z");
    // "now" is JST 2026-08-13 23:00 — same local civil day as dueDate, but
    // its UTC date (2026-08-13) differs from dueDate's UTC date (2026-08-12).
    // The old UTC-based isDueToday would miss this; the old local-based
    // isOverdue would (coincidentally) already get it right — that mismatch
    // between the two is exactly the bug.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-13T14:00:00Z"));

    const r = reminder(dueDate);
    expect(isDueToday(r)).toBe(true);
    expect(isOverdue(r)).toBe(false);
  });

  it("a reminder due yesterday (JST) is overdue and not due today", () => {
    const dueDate = new Date("2026-08-11T15:00:00Z"); // JST 2026-08-12 00:00
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-13T14:00:00Z")); // JST 2026-08-13 23:00

    const r = reminder(dueDate);
    expect(isOverdue(r)).toBe(true);
    expect(isDueToday(r)).toBe(false);
  });

  it("a completed reminder is never overdue", () => {
    const dueDate = new Date("2026-08-01T00:00:00Z");
    const r = { ...reminder(dueDate), completed: true };
    expect(isOverdue(r)).toBe(false);
  });
});

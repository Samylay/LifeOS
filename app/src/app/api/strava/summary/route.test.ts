import { describe, it, expect } from "vitest";
import { startOfWeekInTz } from "./route";

describe("startOfWeekInTz", () => {
  it("returns the true UTC instant of Monday 00:00 local, not a naive UTC-labeled midnight", () => {
    // 2026-08-12 is a Wednesday in Europe/Paris (CEST, UTC+2 in August).
    const now = new Date("2026-08-12T12:00:00Z");
    const weekStart = startOfWeekInTz("Europe/Paris", now);
    // True Monday 00:00 CEST = Sunday 22:00 UTC, NOT Monday 00:00 UTC (the
    // naive Date.UTC(y,m,d) result the old code produced).
    expect(weekStart.toISOString()).toBe("2026-08-09T22:00:00.000Z");
  });

  it("includes a Monday 00:30 local activity in the week window", () => {
    const now = new Date("2026-08-12T12:00:00Z");
    const weekStart = startOfWeekInTz("Europe/Paris", now);
    // Monday 2026-08-10 00:30 CEST = 2026-08-09T22:30:00Z.
    const activityInstant = new Date("2026-08-09T22:30:00Z");
    expect(activityInstant.getTime()).toBeGreaterThanOrEqual(weekStart.getTime());
  });
});

import { describe, it, expect } from "vitest";
import { msUntilNextRun, isPastHourInTz, todayInTz, weekdayLabelInTz } from "./tz";

describe("isPastHourInTz", () => {
  it("is false just before the hour, true just after, in a non-UTC tz", () => {
    // 2026-01-15T05:59:00Z == 14:59 JST (UTC+9)
    const before = new Date("2026-01-15T05:59:00Z");
    expect(isPastHourInTz(15, "Asia/Tokyo", before)).toBe(false);
    // 2026-01-15T06:01:00Z == 15:01 JST
    const after = new Date("2026-01-15T06:01:00Z");
    expect(isPastHourInTz(15, "Asia/Tokyo", after)).toBe(true);
  });

  it("handles the UTC date-boundary case that bit the old server-local aggregator", () => {
    // 21:00 UTC == 06:00 JST next day — server-local time would still think
    // it's "yesterday, 21:00", i.e. not past hour 6.
    const now = new Date("2026-01-14T21:00:00Z");
    expect(isPastHourInTz(6, "Asia/Tokyo", now)).toBe(true);
  });

  it("is false just before hour:minute, true just after, when minute is given", () => {
    // 05:14 UTC == 06:14 Paris (winter, UTC+1) — not yet past 06:15
    const before = new Date("2026-01-15T05:14:00Z");
    expect(isPastHourInTz(6, "Europe/Paris", before, 15)).toBe(false);
    // 05:16 UTC == 06:16 Paris — past 06:15
    const after = new Date("2026-01-15T05:16:00Z");
    expect(isPastHourInTz(6, "Europe/Paris", after, 15)).toBe(true);
  });

  it("defaults the minute to :00 when omitted", () => {
    const now = new Date("2026-01-15T05:16:00Z");
    expect(isPastHourInTz(5, "Europe/Paris", now)).toBe(isPastHourInTz(5, "Europe/Paris", now, 0));
  });
});

describe("msUntilNextRun", () => {
  it("returns time until today's run when the target hour hasn't happened yet", () => {
    const now = new Date("2026-01-15T05:00:00Z"); // 14:00 JST
    const ms = msUntilNextRun(15, "Asia/Tokyo", now); // next 15:00 JST
    expect(ms).toBe(new Date("2026-01-15T06:00:00Z").getTime() - now.getTime());
  });

  it("rolls over to tomorrow when today's target hour has already passed", () => {
    const now = new Date("2026-01-15T07:00:00Z"); // 16:00 JST, past 15:00
    const ms = msUntilNextRun(15, "Asia/Tokyo", now);
    expect(ms).toBe(new Date("2026-01-16T06:00:00Z").getTime() - now.getTime());
  });

  it("always returns a positive duration across a UTC month boundary", () => {
    const now = new Date("2026-01-31T23:30:00Z");
    const ms = msUntilNextRun(6, "Asia/Tokyo", now);
    expect(ms).toBeGreaterThan(0);
  });

  it("defaults the minute to :00 when omitted", () => {
    const now = new Date("2026-01-15T05:00:00Z");
    expect(msUntilNextRun(15, "Asia/Tokyo", now)).toBe(msUntilNextRun(15, "Asia/Tokyo", now, 0));
  });

  it("targets hour:minute, not just the hour, in a non-UTC tz", () => {
    // 05:00 UTC == 06:00 Paris (winter, UTC+1)
    const now = new Date("2026-01-15T05:00:00Z");
    const ms = msUntilNextRun(6, "Europe/Paris", now, 15); // next 06:15 Paris
    expect(ms).toBe(new Date("2026-01-15T05:15:00Z").getTime() - now.getTime());
  });

  it("rolls over to tomorrow when today's hour:minute has already passed", () => {
    // 05:20 UTC == 06:20 Paris, past 06:15
    const now = new Date("2026-01-15T05:20:00Z");
    const ms = msUntilNextRun(6, "Europe/Paris", now, 15);
    expect(ms).toBe(new Date("2026-01-16T05:15:00Z").getTime() - now.getTime());
  });
});

describe("todayInTz", () => {
  it("uses the tz wall-clock date, not the UTC date", () => {
    // 21:30 UTC on Jan 14 == 06:30 JST on Jan 15
    const now = new Date("2026-01-14T21:30:00Z");
    const today = todayInTz("Asia/Tokyo", now);
    expect(today.dateStr).toBe("2026-01-15");
    expect(today.weekdayIndex).toBe(3); // Thursday
  });

  it("computes day-of-year consistently with the tz date", () => {
    const now = new Date("2026-03-01T00:00:00Z"); // well into JST daytime
    const today = todayInTz("Asia/Tokyo", now);
    expect(today.dateStr).toBe("2026-03-01");
    expect(today.dayOfYear).toBe(60); // 2026 is not a leap year
  });
});

describe("weekdayLabelInTz", () => {
  it("returns the full weekday name in the given tz", () => {
    const now = new Date("2026-01-14T21:30:00Z"); // Jan 15 JST, a Thursday
    expect(weekdayLabelInTz("Asia/Tokyo", now)).toBe("Thursday");
  });
});

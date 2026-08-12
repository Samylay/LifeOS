import { describe, it, expect } from "vitest";
import { normalizeTag, parseTags, calendarDaysBetween, lastSessionDaysAgo, type Goal } from "./types";

describe("normalizeTag", () => {
  it("lowercases and kebabs", () => {
    expect(normalizeTag("  LifeOS ")).toBe("lifeos");
    expect(normalizeTag("Infra Fix")).toBe("infra-fix");
  });
  it("strips a leading # and junk characters", () => {
    expect(normalizeTag("#content")).toBe("content");
    expect(normalizeTag("v1.2/beta!")).toBe("v1.2beta");
  });
});

describe("parseTags", () => {
  it("splits on commas, normalizes, dedupes, drops empties", () => {
    expect(parseTags("LifeOS, infra fix, lifeos, ,#infra-fix")).toEqual(["lifeos", "infra-fix"]);
    expect(parseTags("")).toEqual([]);
  });
});

describe("calendarDaysBetween (JST)", () => {
  const originalTz = process.env.TZ;

  it("a moment logged yesterday at 20:00 is 1 calendar day ago at 10:00 today, not 0", () => {
    process.env.TZ = "Asia/Tokyo";
    const then = new Date("2026-08-12T11:00:00Z"); // JST 2026-08-12 20:00
    const now = new Date("2026-08-13T01:00:00Z"); // JST 2026-08-13 10:00
    expect(calendarDaysBetween(then, now)).toBe(1);
    process.env.TZ = originalTz;
  });

  it("a moment logged at 23:00 yesterday does not read as 0 days ago ('today') at any time today", () => {
    process.env.TZ = "Asia/Tokyo";
    const then = new Date("2026-08-12T14:00:00Z"); // JST 2026-08-12 23:00
    const now = new Date("2026-08-13T00:30:00Z"); // JST 2026-08-13 09:30 — 10.5h elapsed, under 24h
    expect(calendarDaysBetween(then, now)).toBe(1);
    process.env.TZ = originalTz;
  });
});

describe("lastSessionDaysAgo (JST)", () => {
  it("a session dated yesterday reads 1 day ago even before a full 24h has elapsed", () => {
    const originalTz = process.env.TZ;
    process.env.TZ = "Asia/Tokyo";
    const goal: Goal = {
      id: "g1",
      title: "t",
      quarter: "2026-Q3",
      status: "active",
      milestones: [],
      doneMilestones: [],
      commitments: [],
      sessions: [{ date: "2026-08-12" }],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const now = new Date("2026-08-13T00:30:00Z"); // JST 2026-08-13 09:30
    expect(lastSessionDaysAgo(goal, now)).toBe(1);
    process.env.TZ = originalTz;
  });
});

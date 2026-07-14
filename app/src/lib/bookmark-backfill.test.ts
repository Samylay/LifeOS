import { describe, it, expect } from "vitest";
import { hostOf, ageLabel } from "./bookmark-backfill";

describe("hostOf", () => {
  it("strips www and the scheme", () => {
    expect(hostOf("https://www.youtube.com/watch?v=abc")).toBe("youtube.com");
    expect(hostOf("http://roadmap.sh/ai-engineer")).toBe("roadmap.sh");
  });

  it("degrades instead of throwing on junk", () => {
    expect(hostOf("not a url")).toBe("not a url");
    expect(hostOf("")).toBe("");
  });
});

describe("ageLabel", () => {
  const now = new Date("2026-07-14T00:00:00Z");

  it("scales the unit to the age", () => {
    expect(ageLabel("2026-07-14T00:00:00Z", now)).toBe("today");
    expect(ageLabel("2026-07-02T00:00:00Z", now)).toBe("12d");
    expect(ageLabel("2026-03-14T00:00:00Z", now)).toBe("4mo");
    expect(ageLabel("2022-07-14T00:00:00Z", now)).toBe("4y");
  });

  it("returns empty rather than a negative age for a future date", () => {
    expect(ageLabel("2027-01-01T00:00:00Z", now)).toBe("");
  });

  it("returns empty on an unparseable date", () => {
    expect(ageLabel("whenever", now)).toBe("");
  });
});

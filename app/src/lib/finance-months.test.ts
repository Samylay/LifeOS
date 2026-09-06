import { describe, it, expect } from "vitest";
import { recentMonths } from "./finance-months";

describe("recentMonths", () => {
  it("returns the given count of months, oldest first, ending on the reference month", () => {
    expect(recentMonths("2026-09-06", 6)).toEqual([
      "2026-04",
      "2026-05",
      "2026-06",
      "2026-07",
      "2026-08",
      "2026-09",
    ]);
  });

  it("crosses a year boundary correctly", () => {
    expect(recentMonths("2026-02-15", 3)).toEqual(["2025-12", "2026-01", "2026-02"]);
  });

  it("returns just the current month for count 1", () => {
    expect(recentMonths("2026-09-06", 1)).toEqual(["2026-09"]);
  });
});

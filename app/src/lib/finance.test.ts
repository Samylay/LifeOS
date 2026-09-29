import { describe, expect, it } from "vitest";
import { formatEuro, keywordKind, monthlyAmount, yearlyAmount } from "./finance";

describe("bank finance helpers", () => {
  it("converts recurring amounts to monthly and yearly run-rates", () => {
    expect(monthlyAmount({ amount: 12, cadence: "monthly" })).toBe(12);
    expect(monthlyAmount({ amount: 120, cadence: "yearly" })).toBe(10);
    expect(monthlyAmount({ amount: 30, cadence: "quarterly" })).toBe(10);
    expect(monthlyAmount({ amount: 12, cadence: "weekly" })).toBeCloseTo(52, 5);
    expect(yearlyAmount({ amount: 25, cadence: "monthly" })).toBe(300);
  });

  it("keeps one-offs out of the monthly run-rate and counts them once yearly", () => {
    expect(monthlyAmount({ amount: 400, cadence: "oneoff" })).toBe(0);
    expect(yearlyAmount({ amount: 400, cadence: "oneoff" })).toBe(400);
  });

  it("keeps shared merchant classification and euro formatting available", () => {
    expect(keywordKind("Loyer" )).toBe("fixed");
    expect(keywordKind("Spotify" )).toBe("sub");
    expect(keywordKind("Courses" )).toBe("variable");
    expect(formatEuro(12.5)).toContain("12,50");
  });
});

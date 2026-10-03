import { describe, expect, it } from "vitest";
import type { FinanceActivity } from "./finance-activity";
import { categoryTotalsInRange, cumulativeSpend, cycleLabel, payCycle, totalsInRange } from "./finance-cycle";

const tx = (over: Partial<FinanceActivity>): FinanceActivity => ({
  transactionId: "t", merchantKey: "m", label: "L", bankLabel: "L", category: "Other", corrected: false, amount: 10,
  currency: "EUR", date: "2026-10-03", accountUid: "a", direction: "out", isTransfer: false, included: true, ...over,
});

describe("payCycle", () => {
  it("starts on the 27th of the previous month before the 27th", () => {
    const cycle = payCycle("2026-10-03");
    expect(cycle.start).toBe("2026-09-27");
    expect(cycle.end).toBe("2026-10-26");
    expect(cycle.nextStart).toBe("2026-10-27");
    expect(cycle.days).toBe(30);
    expect(cycle.day).toBe(7);
  });
  it("starts today on the 27th, and on the 26th is the last day", () => {
    expect(payCycle("2026-10-27")).toMatchObject({ start: "2026-10-27", end: "2026-11-26", day: 1 });
    const last = payCycle("2026-10-26");
    expect(last).toMatchObject({ start: "2026-09-27", end: "2026-10-26", day: 30 });
  });
  it("crosses the year and short months", () => {
    expect(payCycle("2027-01-10")).toMatchObject({ start: "2026-12-27", end: "2027-01-26", days: 31 });
    expect(payCycle("2026-03-05")).toMatchObject({ start: "2026-02-27", end: "2026-03-26", days: 28 });
  });
  it("describes the previous cycle whole and cut at the same day number", () => {
    const cycle = payCycle("2026-10-03");
    expect(cycle.previous).toEqual({ start: "2026-08-27", end: "2026-09-26" });
    expect(cycle.previousThroughSameDay).toEqual({ start: "2026-08-27", end: "2026-09-02" });
  });
  it("honours a different pay day", () => {
    expect(payCycle("2026-10-03", 1)).toMatchObject({ start: "2026-10-01", end: "2026-10-31" });
  });
});

describe("cycle totals", () => {
  const activity = [
    tx({ date: "2026-09-26", amount: 500 }),                                   // before the cycle
    tx({ date: "2026-09-27", amount: 2500, direction: "in", category: "Income" }), // salary on day 1
    tx({ date: "2026-09-28", amount: 40, category: "Groceries" }),
    tx({ date: "2026-10-02", amount: 60, category: "Groceries" }),
    tx({ date: "2026-10-02", amount: 99, isTransfer: true, category: "Transfer" }),
    tx({ date: "2026-10-02", amount: 99, included: false }),
    tx({ date: "2026-10-02", amount: 99, currency: "USD" }),
  ];
  const range = { start: "2026-09-27", end: "2026-10-26" };
  it("counts salary on the 27th and ignores transfers, excluded and foreign rows", () => {
    expect(totalsInRange(activity, range)).toEqual({ in: 2500, out: 100 });
  });
  it("totals categories and cumulative spend by cycle day", () => {
    expect(categoryTotalsInRange(activity, range).get("Groceries")).toBe(100);
    expect(cumulativeSpend(activity, range, 7)).toEqual([0, 40, 40, 40, 40, 100, 100]);
  });
  it("labels the range", () => {
    expect(cycleLabel(range)).toBe("27 Sep – 26 Oct");
  });
});

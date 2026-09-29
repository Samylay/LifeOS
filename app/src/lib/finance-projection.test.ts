import { describe, expect, it } from "vitest";
import { leftThisMonth } from "./finance-projection";

describe("leftThisMonth", () => {
  it("uses received income and subtracts spend plus remaining recurring charges", () => {
    expect(leftThisMonth({ incomeSoFar: 2400, expectedRecurringIncome: 900, spent: 620, remainingRecurringCharges: 480 })).toEqual({
      income: 2400,
      incomeSource: "received",
      spent: 620,
      remainingRecurringCharges: 480,
      left: 1300,
    });
  });

  it("falls back to expected recurring income before the first payment arrives", () => {
    expect(leftThisMonth({ incomeSoFar: 0, expectedRecurringIncome: 1800, spent: 230, remainingRecurringCharges: 540 }).left).toBe(1030);
  });

  it("keeps a negative result when known outgoings exceed income", () => {
    expect(leftThisMonth({ incomeSoFar: 100, expectedRecurringIncome: 900, spent: 800, remainingRecurringCharges: 250 }).left).toBe(-950);
  });
});

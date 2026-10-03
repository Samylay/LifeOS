import { describe, expect, it } from "vitest";
import { leftThisMonth } from "./finance-projection";

describe("leftThisMonth", () => {
  it("adds income still due to income received, then subtracts spend and charges still due", () => {
    expect(leftThisMonth({ incomeSoFar: 2400, expectedRecurringIncome: 900, spent: 620, remainingRecurringCharges: 480 })).toEqual({
      income: 3300,
      incomeSource: "received and expected",
      spent: 620,
      remainingRecurringCharges: 480,
      left: 2200,
    });
  });

  it("uses only received income when nothing more is due", () => {
    expect(leftThisMonth({ incomeSoFar: 2400, expectedRecurringIncome: 0, spent: 620, remainingRecurringCharges: 480 })).toMatchObject({ income: 2400, incomeSource: "received", left: 1300 });
  });

  it("uses expected income before the first payment arrives", () => {
    expect(leftThisMonth({ incomeSoFar: 0, expectedRecurringIncome: 1800, spent: 230, remainingRecurringCharges: 540 })).toMatchObject({ incomeSource: "expected", left: 1030 });
  });

  it("keeps a negative result when known outgoings exceed income", () => {
    expect(leftThisMonth({ incomeSoFar: 100, expectedRecurringIncome: 900, spent: 800, remainingRecurringCharges: 250 }).left).toBe(-50);
  });
});

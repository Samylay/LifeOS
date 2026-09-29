export interface LeftThisMonthInput {
  incomeSoFar: number;
  expectedRecurringIncome: number;
  spent: number;
  remainingRecurringCharges: number;
}

export interface LeftThisMonthResult {
  income: number;
  incomeSource: "received" | "expected";
  spent: number;
  remainingRecurringCharges: number;
  left: number;
}

/** Calculates the amount left after known spending and upcoming recurring charges. */
export function leftThisMonth(input: LeftThisMonthInput): LeftThisMonthResult {
  const income = input.incomeSoFar > 0 ? input.incomeSoFar : input.expectedRecurringIncome;
  return {
    income,
    incomeSource: input.incomeSoFar > 0 ? "received" : "expected",
    spent: input.spent,
    remainingRecurringCharges: input.remainingRecurringCharges,
    left: income - input.spent - input.remainingRecurringCharges,
  };
}

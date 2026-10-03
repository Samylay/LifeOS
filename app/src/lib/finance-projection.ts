export interface LeftThisMonthInput {
  incomeSoFar: number;
  expectedRecurringIncome: number;
  spent: number;
  remainingRecurringCharges: number;
}

export interface LeftThisMonthResult {
  income: number;
  /** What the income figure is made of. */
  incomeSource: "received" | "expected" | "received and expected";
  spent: number;
  remainingRecurringCharges: number;
  left: number;
}

/** Amount left in the cycle: income received plus recurring income still due, minus spending so
 *  far and recurring charges still due. The caller passes only items inside the current pay cycle,
 *  so a payment that has already arrived is no longer "due" and is never counted twice. */
export function leftThisMonth(input: LeftThisMonthInput): LeftThisMonthResult {
  const income = input.incomeSoFar + input.expectedRecurringIncome;
  return {
    income,
    incomeSource: input.expectedRecurringIncome > 0 ? (input.incomeSoFar > 0 ? "received and expected" : "expected") : "received",
    spent: input.spent,
    remainingRecurringCharges: input.remainingRecurringCharges,
    left: income - input.spent - input.remainingRecurringCharges,
  };
}

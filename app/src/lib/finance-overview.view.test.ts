import { describe, expect, it } from "vitest";
import { addMarkedSubscriptions } from "./finance-overview";
import type { FinanceActivity, MerchantLabel } from "./finance-activity";

const item = (overrides: Partial<FinanceActivity> = {}): FinanceActivity => ({
  transactionId: "fixture-transaction",
  merchantKey: "APPLE COM BILL",
  label: "Apple subscription",
  bankLabel: "APPLE.COM/BILL",
  category: "Subscriptions",
  corrected: true,
  amount: 9.99,
  currency: "EUR",
  date: "2026-09-09",
  accountUid: "fixture-account",
  direction: "out",
  isTransfer: false,
  included: true,
  ...overrides,
});

describe("marked subscriptions in recurring view", () => {
  it("adds a user-marked merchant immediately even before cadence can be detected", () => {
    const labels: Record<string, MerchantLabel> = {
      "APPLE COM BILL": { label: "Apple subscription", category: "Subscriptions" },
    };
    const result = addMarkedSubscriptions([], [item()], labels, "2026-09");
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      label: "Apple subscription",
      kind: "sub",
      cadence: "unknown",
      occurrenceCount: 1,
      amount: 9.99,
      isNew: true,
    });
  });

  it("does not duplicate an already detected cadence or count transfers as subscriptions", () => {
    const detected = [{
      merchantKey: "APPLE COM BILL",
      label: "Apple subscription",
      direction: "out" as const,
      cadence: "monthly" as const,
      amount: 9.99,
      kind: "sub" as const,
      firstSeen: "2026-07-09",
      lastSeen: "2026-09-09",
      confidence: 0.9,
      occurrenceCount: 3,
      overridden: false,
      isNew: false,
    }];
    const labels: Record<string, MerchantLabel> = {
      "APPLE COM BILL": { label: "Apple subscription", category: "Subscriptions" },
    };
    const result = addMarkedSubscriptions(detected, [item({ isTransfer: true })], labels, "2026-09");
    expect(result).toEqual(detected);
  });

  it("dates alone set the cadence of a marked merchant whose price changed", () => {
    const labels: Record<string, MerchantLabel> = {
      "APPLE COM BILL": { label: "Apple subscription", category: "Subscriptions" },
      "POWER CO": { label: "Power", category: "Bills" },
    };
    const activity = [
      item({ transactionId: "a1", date: "2026-06-18", amount: 20 }),
      item({ transactionId: "a2", date: "2026-07-07", amount: 90 }),
      item({ transactionId: "a3", date: "2026-08-07", amount: 100 }),
      item({ transactionId: "a4", date: "2026-09-07", amount: 20 }),
      item({ transactionId: "p1", merchantKey: "POWER CO", date: "2026-08-06", amount: 24 }),
      item({ transactionId: "p2", merchantKey: "POWER CO", date: "2026-09-05", amount: 17 }),
    ];
    const result = addMarkedSubscriptions([], activity, labels, "2026-09");
    expect(result.find((c) => c.merchantKey === "APPLE COM BILL")).toMatchObject({ cadence: "monthly", amount: 20, kind: "sub", occurrenceCount: 4 });
    expect(result.find((c) => c.merchantKey === "POWER CO")).toMatchObject({ cadence: "monthly", amount: 17, kind: "fixed" });
  });
});

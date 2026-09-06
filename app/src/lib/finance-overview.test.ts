// Same test pattern as bank-db.test.ts: LIFEOS_DB_PATH must be set before
// any query runs, so it's set before the dynamic import.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import type { RecurringCharge } from "./finance-burn";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lifeos-finance-overview-test-"));
process.env.LIFEOS_DB_PATH = path.join(tmpDir, "test.db");

const { getFinanceOverview, markNewlyAppeared, groupCancellable } = await import("./finance-overview");
const { saveBankSession, upsertBankTransactions, saveAccountBalance, setBankSyncState } = await import("./bank-db");
const { setClassificationOverride, clearClassificationOverride } = await import("./finance-overrides-db");

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function out(id: string, date: string, amount: string, creditorName: string) {
  return {
    transactionId: id,
    accountUid: "acct-1",
    bookingDate: date,
    amount,
    currency: "EUR",
    creditorName,
    raw: { credit_debit_indicator: "DBIT" },
  };
}

// Fixture builder for the pure ticket-03 helpers — never a real bank fixture,
// this repo's remote is public.
function charge(over: Partial<RecurringCharge>): RecurringCharge {
  return {
    merchantKey: "MERCHANT",
    label: "Merchant",
    direction: "out",
    cadence: "monthly",
    amount: 10,
    kind: "sub",
    firstSeen: "2026-06-01",
    lastSeen: "2026-08-01",
    confidence: 0.6,
    occurrenceCount: 3,
    overridden: false,
    ...over,
  };
}

describe("markNewlyAppeared", () => {
  it("marks a charge new when its first occurrence falls in the given month", () => {
    const [c] = markNewlyAppeared([charge({ firstSeen: "2026-09-03" })], "2026-09");
    expect(c.isNew).toBe(true);
  });

  it("does not mark a long-running charge new just because it recurred this month", () => {
    const [c] = markNewlyAppeared([charge({ firstSeen: "2026-06-01", lastSeen: "2026-09-01" })], "2026-09");
    expect(c.isNew).toBe(false);
  });

  it("stops marking a charge new once its first occurrence ages out of the current month", () => {
    // Same charge, a month later — the label clears on its own, nothing to dismiss.
    const charges = [charge({ firstSeen: "2026-09-03" })];
    expect(markNewlyAppeared(charges, "2026-09")[0].isNew).toBe(true);
    expect(markNewlyAppeared(charges, "2026-10")[0].isNew).toBe(false);
  });
});

describe("groupCancellable", () => {
  it("keeps only sub-classified charges, dearest first by yearly cost", () => {
    const views = markNewlyAppeared(
      [
        charge({ merchantKey: "gym", kind: "sub", amount: 30, cadence: "monthly" }),
        charge({ merchantKey: "rent", kind: "fixed", amount: 650, cadence: "monthly" }),
        charge({ merchantKey: "streaming", kind: "sub", amount: 13.49, cadence: "monthly" }),
        charge({ merchantKey: "domain", kind: "sub", amount: 40, cadence: "yearly" }),
      ],
      "2026-09"
    );
    const group = groupCancellable(views);
    expect(group.charges.map((c) => c.merchantKey)).toEqual(["gym", "streaming", "domain"]);
    // 30*12 + 13.49*12 + 40 = 360 + 161.88 + 40
    expect(group.yearlyTotal).toBeCloseTo(561.88, 2);
  });

  it("returns an empty group and a zero total when nothing is cancellable", () => {
    const views = markNewlyAppeared([charge({ kind: "fixed" })], "2026-09");
    const group = groupCancellable(views);
    expect(group.charges).toEqual([]);
    expect(group.yearlyTotal).toBe(0);
  });
});

describe("getFinanceOverview — before any sync or seeded data", () => {
  it("returns a zeroed overview with no accounts and no sync", () => {
    const overview = getFinanceOverview(new Date("2026-09-06T12:00:00Z"));
    expect(overview.months).toHaveLength(6);
    expect(overview.months[overview.months.length - 1].burn.month).toBe("2026-09");
    expect(overview.months.every((m) => m.burn.out === 0)).toBe(true);
    expect(overview.accounts).toEqual([]);
    expect(overview.lastSyncAt).toBeNull();
    expect(overview.stale).toBe(true);
    expect(overview.consentWarnings).toEqual([]);
    expect(overview.recurringCharges).toEqual([]);
    expect(overview.cancellable).toEqual({ charges: [], yearlyTotal: 0 });
  });
});

describe("getFinanceOverview — with seeded data", () => {
  beforeAll(() => {
    saveBankSession({
      sessionId: "sess-1",
      accounts: ["acct-1"],
      aspspName: "REDACTED_BANK",
      aspspCountry: "FR",
      validUntil: "2027-02-28T00:00:00Z",
      now: "2026-09-01T00:00:00Z",
    });
    saveAccountBalance("acct-1", "1234.56", "EUR", "2026-09-01T00:00:00Z");
    upsertBankTransactions([
      out("t1", "2026-08-10", "42.17", "CARREFOUR CITY"),
      out("t2", "2026-09-01", "50.00", "CARREFOUR CITY"),
      // A steady monthly subscription across 3 months, evenly spaced ~30
      // days apart (subscription-detector.ts's monthly tolerance is 5 days)
      // — enough to confirm the cadence.
      out("n1", "2026-07-01", "13.49", "STREAMFLIX.COM 1111"),
      out("n2", "2026-08-01", "13.49", "STREAMFLIX.COM 2222"),
      out("n3", "2026-09-01", "13.49", "STREAMFLIX.COM 3333"),
    ]);
    setBankSyncState("last_sync_at", String(Date.parse("2026-09-01T00:00:00Z")));
  });

  it("rolls synced transactions into the right month's burn", () => {
    const overview = getFinanceOverview(new Date("2026-09-06T12:00:00Z"));
    const august = overview.months.find((m) => m.burn.month === "2026-08")!;
    const september = overview.months.find((m) => m.burn.month === "2026-09")!;
    // Plus the 13.49/month subscription seeded above, which lands in both
    // months (2026-08-15 and 2026-09-01).
    expect(august.burn.out).toBeCloseTo(42.17 + 13.49, 2);
    expect(september.burn.out).toBeCloseTo(50.0 + 13.49, 2);
  });

  it("carries account balances and the bank name through", () => {
    const overview = getFinanceOverview(new Date("2026-09-06T12:00:00Z"));
    expect(overview.accounts).toHaveLength(1);
    expect(overview.accounts[0].aspspName).toBe("REDACTED_BANK");
    expect(overview.accounts[0].balanceAmount).toBe("1234.56");
  });

  it("reports a sync from 5 days ago as stale (crosses the 48h threshold)", () => {
    const overview = getFinanceOverview(new Date("2026-09-06T12:00:00Z"));
    expect(overview.lastSyncAt).toBe(Date.parse("2026-09-01T00:00:00Z"));
    expect(overview.stale).toBe(true);
    expect(overview.lastSyncedLabel).toMatch(/days? ago/);
  });

  it("does not report a consent expiring in 2027 as a current warning", () => {
    const overview = getFinanceOverview(new Date("2026-09-06T12:00:00Z"));
    expect(overview.consentWarnings).toEqual([]);
  });

  it("lists the detected recurring charge, matching the sub total the burn split reports", () => {
    const overview = getFinanceOverview(new Date("2026-09-06T12:00:00Z"));
    expect(overview.recurringCharges).toHaveLength(1);
    const streamflix = overview.recurringCharges[0];
    expect(streamflix.kind).toBe("sub");
    expect(streamflix.occurrenceCount).toBe(3);
    expect(streamflix.firstSeen).toBe("2026-07-01");
    expect(streamflix.lastSeen).toBe("2026-09-01");
    // Not "new": its first occurrence (July) is well before the current
    // month (September) on screen.
    expect(streamflix.isNew).toBe(false);

    const september = overview.months.find((m) => m.burn.month === "2026-09")!;
    expect(september.burn.sub).toBeCloseTo(13.49, 2);
  });

  it("groups the same charge into `cancellable` with its yearly cost", () => {
    const overview = getFinanceOverview(new Date("2026-09-06T12:00:00Z"));
    expect(overview.cancellable.charges).toHaveLength(1);
    expect(overview.cancellable.charges[0].merchantKey).toBe(overview.recurringCharges[0].merchantKey);
    expect(overview.cancellable.yearlyTotal).toBeCloseTo(13.49 * 12, 2);
  });

  it("reports a consent expiring within the warning window", () => {
    saveBankSession({
      sessionId: "sess-1",
      accounts: ["acct-1"],
      aspspName: "REDACTED_BANK",
      aspspCountry: "FR",
      validUntil: "2026-09-10T00:00:00Z",
    });
    const overview = getFinanceOverview(new Date("2026-09-06T12:00:00Z"));
    expect(overview.consentWarnings).toHaveLength(1);
    expect(overview.consentWarnings[0].aspspName).toBe("REDACTED_BANK");
  });
});

// Ticket 04: corrections read through the glue layer, not just the pure
// finance-burn.ts module already covered by finance-burn.test.ts.
describe("getFinanceOverview — classification overrides (ticket 04)", () => {
  // normalizeMerchantKey (subscription-detector.ts) strips reference-number
  // tokens and non-alphanumerics, so "STREAMFLIX.COM 1111" normalizes to
  // this, not the raw label — the whole point of keying on it.
  const merchantKey = "STREAMFLIX COM";

  afterAll(() => {
    clearClassificationOverride(merchantKey);
  });

  it("detects Streamflix as `sub` with no correction stored", () => {
    const overview = getFinanceOverview(new Date("2026-09-06T12:00:00Z"));
    const streamflix = overview.recurringCharges.find((c) => c.merchantKey === merchantKey)!;
    expect(streamflix.kind).toBe("sub");
    expect(streamflix.overridden).toBe(false);
  });

  it("an override changes the recurring-charge kind AND the burn split's fixed/sub bucket immediately", () => {
    setClassificationOverride(merchantKey, "fixed", "2026-09-06T00:00:00Z");
    const overview = getFinanceOverview(new Date("2026-09-06T12:00:00Z"));
    const streamflix = overview.recurringCharges.find((c) => c.merchantKey === merchantKey)!;
    expect(streamflix.kind).toBe("fixed");
    expect(streamflix.overridden).toBe(true);

    const september = overview.months.find((m) => m.burn.month === "2026-09")!;
    expect(september.burn.sub).toBeCloseTo(0, 2);
    expect(september.burn.fixed).toBeCloseTo(13.49, 2);
    // The bucket-sum invariant still holds cent-exactly with an override applied.
    expect(september.burn.fixed + september.burn.sub + september.burn.variable).toBeCloseTo(september.burn.out, 2);
  });

  it("the correction survives a re-sync — inserting an already-seen transaction again changes nothing about it", () => {
    upsertBankTransactions([out("n3", "2026-09-01", "13.49", "STREAMFLIX.COM 3333")]);
    const overview = getFinanceOverview(new Date("2026-09-06T12:00:00Z"));
    const streamflix = overview.recurringCharges.find((c) => c.merchantKey === merchantKey)!;
    expect(streamflix.kind).toBe("fixed");
  });

  it("the correction applies to a brand-new transaction from the same counterparty (a future charge, not just past ones)", () => {
    // ~30 days after the September occurrence, so it still confirms the same
    // monthly cadence (CADENCE_TOLERANCE_DAYS.monthly is 5 days).
    upsertBankTransactions([out("n4", "2026-10-01", "13.49", "STREAMFLIX.COM 9999")]);
    const overview = getFinanceOverview(new Date("2026-10-02T12:00:00Z"));
    const streamflix = overview.recurringCharges.find((c) => c.merchantKey === merchantKey)!;
    expect(streamflix.kind).toBe("fixed");
    expect(streamflix.occurrenceCount).toBe(4);
  });

  it("clearing the correction is reversible: the charge returns to the detected classification", () => {
    clearClassificationOverride(merchantKey);
    const overview = getFinanceOverview(new Date("2026-10-02T12:00:00Z"));
    const streamflix = overview.recurringCharges.find((c) => c.merchantKey === merchantKey)!;
    expect(streamflix.kind).toBe("sub");
    expect(streamflix.overridden).toBe(false);
  });
});

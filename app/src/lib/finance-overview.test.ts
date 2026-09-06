// Same test pattern as bank-db.test.ts: LIFEOS_DB_PATH must be set before
// any query runs, so it's set before the dynamic import.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lifeos-finance-overview-test-"));
process.env.LIFEOS_DB_PATH = path.join(tmpDir, "test.db");

const { getFinanceOverview } = await import("./finance-overview");
const { saveBankSession, upsertBankTransactions, saveAccountBalance, setBankSyncState } = await import("./bank-db");

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
    ]);
    setBankSyncState("last_sync_at", String(Date.parse("2026-09-01T00:00:00Z")));
  });

  it("rolls synced transactions into the right month's burn", () => {
    const overview = getFinanceOverview(new Date("2026-09-06T12:00:00Z"));
    const august = overview.months.find((m) => m.burn.month === "2026-08")!;
    const september = overview.months.find((m) => m.burn.month === "2026-09")!;
    expect(august.burn.out).toBeCloseTo(42.17, 2);
    expect(september.burn.out).toBeCloseTo(50.0, 2);
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

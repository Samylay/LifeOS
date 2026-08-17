import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

// getBankDb() lazily opens the file on first use and caches env in a
// module-level singleton, so LIFEOS_DB_PATH must be set before any query
// runs — never point this at the real data/lifeos.db (see server-db.test.ts).
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lifeos-bank-db-test-"));
process.env.LIFEOS_DB_PATH = path.join(tmpDir, "test.db");

const {
  saveBankSession,
  listBankSessions,
  listBankAccounts,
  upsertBankTransactions,
  countBankTransactions,
  getBankSyncState,
  setBankSyncState,
  saveAccountBalance,
  listConnectedAccounts,
  listRecentBankTransactions,
} = await import("./bank-db");

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("saveBankSession", () => {
  beforeAll(() => {
    saveBankSession({
      sessionId: "sess-1",
      accounts: ["acct-1", "acct-2"],
      aspspName: "REDACTED_BANK",
      aspspCountry: "FR",
      validUntil: "2027-02-03T00:00:00Z",
      now: "2026-08-17T00:00:00Z",
    });
  });

  it("persists the session and its linked accounts", () => {
    const sessions = listBankSessions();
    expect(sessions).toEqual([
      {
        sessionId: "sess-1",
        aspspName: "REDACTED_BANK",
        aspspCountry: "FR",
        accounts: ["acct-1", "acct-2"],
        validUntil: "2027-02-03T00:00:00Z",
        createdAt: "2026-08-17T00:00:00Z",
      },
    ]);
    const accounts = listBankAccounts();
    expect(accounts.map((a) => a.accountUid).sort()).toEqual(["acct-1", "acct-2"]);
    expect(accounts.every((a) => a.sessionId === "sess-1")).toBe(true);
  });

  it("re-saving the same session updates fields instead of duplicating rows", () => {
    saveBankSession({
      sessionId: "sess-1",
      accounts: ["acct-1", "acct-2", "acct-3"],
      aspspName: "REDACTED_BANK",
      aspspCountry: "FR",
      validUntil: "2027-03-01T00:00:00Z",
    });
    expect(listBankSessions()).toHaveLength(1);
    expect(listBankSessions()[0].validUntil).toBe("2027-03-01T00:00:00Z");
    expect(listBankAccounts().map((a) => a.accountUid).sort()).toEqual(["acct-1", "acct-2", "acct-3"]);
  });
});

describe("upsertBankTransactions", () => {
  const txn = {
    transactionId: "txn-1",
    accountUid: "acct-1",
    bookingDate: "2026-08-01",
    valueDate: "2026-08-01",
    amount: "-9.99",
    currency: "EUR",
    creditorName: "REDACTED_MERCHANT",
    remittanceInformation: ["REDACTED SUBSCRIPTION"],
    raw: { transaction_id: "txn-1" },
  };

  it("inserts a new transaction", () => {
    const inserted = upsertBankTransactions([txn], "2026-08-17T00:00:00Z");
    expect(inserted).toBe(1);
    expect(countBankTransactions()).toBe(1);
  });

  it("is idempotent: re-syncing the same transaction id inserts 0 rows and mutates nothing", () => {
    const before = countBankTransactions();
    const inserted = upsertBankTransactions(
      [{ ...txn, amount: "-999.99" /* even if the payload differs, dedup wins */ }],
      "2026-08-18T00:00:00Z"
    );
    expect(inserted).toBe(0);
    expect(countBankTransactions()).toBe(before);
  });

  it("a genuinely new transaction id still inserts", () => {
    const inserted = upsertBankTransactions([{ ...txn, transactionId: "txn-2" }]);
    expect(inserted).toBe(1);
    expect(countBankTransactions()).toBe(2);
  });
});

describe("bank sync state", () => {
  it("round-trips a value", () => {
    expect(getBankSyncState("last_sync_at")).toBeNull();
    setBankSyncState("last_sync_at", "12345");
    expect(getBankSyncState("last_sync_at")).toBe("12345");
  });
});

describe("connected accounts + balances (T71)", () => {
  it("listConnectedAccounts starts with balance fields null before any sync", () => {
    const accounts = listConnectedAccounts();
    const acct1 = accounts.find((a) => a.accountUid === "acct-1")!;
    expect(acct1.aspspName).toBe("REDACTED_BANK");
    expect(acct1.balanceAmount).toBeNull();
    expect(acct1.balanceCurrency).toBeNull();
    expect(acct1.balanceSyncedAt).toBeNull();
  });

  it("saveAccountBalance persists an amount + currency and joins session info", () => {
    saveAccountBalance("acct-1", "1234.56", "EUR", "2026-08-17T00:00:00Z");
    const acct1 = listConnectedAccounts().find((a) => a.accountUid === "acct-1")!;
    expect(acct1.balanceAmount).toBe("1234.56");
    expect(acct1.balanceCurrency).toBe("EUR");
    expect(acct1.balanceSyncedAt).toBe("2026-08-17T00:00:00Z");
    expect(acct1.sessionId).toBe("sess-1");
    // acct-2 was never given a balance — it must stay untouched, not inherit acct-1's.
    const acct2 = listConnectedAccounts().find((a) => a.accountUid === "acct-2")!;
    expect(acct2.balanceAmount).toBeNull();
  });
});

describe("listRecentBankTransactions (T71)", () => {
  it("returns synced transactions newest-first, capped at the given limit", () => {
    const recent = listRecentBankTransactions(1);
    expect(recent).toHaveLength(1);
    expect(recent[0].transactionId).toBe("txn-2");
    expect(recent[0].amount).toBe("-9.99");

    const all = listRecentBankTransactions(10);
    expect(all.map((t) => t.transactionId).sort()).toEqual(["txn-1", "txn-2"]);
  });
});

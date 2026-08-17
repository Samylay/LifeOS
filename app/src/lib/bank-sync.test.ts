import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import crypto from "node:crypto";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lifeos-bank-sync-test-"));
process.env.LIFEOS_DB_PATH = path.join(tmpDir, "test.db");

const { privateKey } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

const { saveBankSession, countBankTransactions } = await import("./bank-db");
const { syncBankTransactions } = await import("./bank-sync");

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const origEnv = { ...process.env };

beforeEach(() => {
  process.env.ENABLE_BANKING_APP_ID = "app-id-123";
  process.env.ENABLE_BANKING_PRIVATE_KEY = privateKey;
});
afterEach(() => {
  process.env = { ...origEnv };
});

beforeAll(() => {
  saveBankSession({ sessionId: "sess-1", accounts: ["acct-1"] });
});

function fixtureResponse(transactionId: string, continuationKey?: string) {
  return new Response(
    JSON.stringify({
      transactions: [
        {
          transaction_id: transactionId,
          booking_date: "2026-08-01",
          value_date: "2026-08-01",
          transaction_amount: { amount: "-9.99", currency: "EUR" },
          creditor: { name: "REDACTED_MERCHANT" },
          remittance_information: ["REDACTED SUBSCRIPTION"],
        },
      ],
      ...(continuationKey ? { continuation_key: continuationKey } : {}),
    }),
    { status: 200 }
  );
}

describe("syncBankTransactions", () => {
  it("returns not-configured when creds are missing", async () => {
    delete process.env.ENABLE_BANKING_APP_ID;
    const transport = vi.fn();
    const result = await syncBankTransactions(transport as unknown as typeof fetch);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("not configured");
    expect(transport).not.toHaveBeenCalled();
  });

  it("fetches transactions for every linked account and inserts them", async () => {
    const transport = vi.fn(async () => fixtureResponse("txn-1"));
    const result = await syncBankTransactions(transport as unknown as typeof fetch);
    expect(result.ok).toBe(true);
    expect(result.totalInserted).toBe(1);
    expect(result.accounts).toEqual([{ accountUid: "acct-1", fetched: 1, inserted: 1 }]);
    expect(countBankTransactions()).toBe(1);
  });

  it("pages through continuation_key until exhausted", async () => {
    let call = 0;
    const transport = vi.fn(async () => {
      call++;
      return call === 1 ? fixtureResponse("txn-page-1", "next") : fixtureResponse("txn-page-2");
    });
    const result = await syncBankTransactions(transport as unknown as typeof fetch);
    expect(result.ok).toBe(true);
    const acct = result.accounts.find((a) => a.accountUid === "acct-1")!;
    expect(acct.fetched).toBe(2);
    // 2 transaction pages + 1 balance fetch (T71). The mock's third response
    // isn't balance-shaped, so getBalances' body.balances.map throws inside
    // its own try/catch and is swallowed — balance sync is best-effort.
    expect(transport).toHaveBeenCalledTimes(3);
  });

  it("re-running the same sync a second time inserts 0 new rows and mutates nothing (idempotent)", async () => {
    const transport = vi.fn(async () => fixtureResponse("txn-page-1"));
    const before = countBankTransactions();
    const result = await syncBankTransactions(transport as unknown as typeof fetch);
    expect(result.ok).toBe(true);
    expect(result.totalInserted).toBe(0);
    expect(countBankTransactions()).toBe(before);
  });
});

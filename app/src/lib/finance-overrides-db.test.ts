// Ticket 04: the one writable path in the finance vertical. Same test
// pattern as bank-db.test.ts — LIFEOS_DB_PATH must be set before any query
// runs, so it's set before the dynamic import.
import { describe, it, expect, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lifeos-finance-overrides-db-test-"));
process.env.LIFEOS_DB_PATH = path.join(tmpDir, "test.db");

const { listClassificationOverrides, setClassificationOverride, clearClassificationOverride } = await import(
  "./finance-overrides-db"
);
const { upsertBankTransactions } = await import("./bank-db");

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("listClassificationOverrides", () => {
  it("is empty with nothing set", () => {
    expect(listClassificationOverrides()).toEqual({});
  });
});

describe("setClassificationOverride", () => {
  it("persists a correction keyed by the normalized counterparty, not a transaction id", () => {
    setClassificationOverride("PLACEHOLDER GYM CO", "variable", "2026-09-01T00:00:00Z");
    expect(listClassificationOverrides()).toEqual({ "PLACEHOLDER GYM CO": "variable" });
  });

  it("upserts — setting the same counterparty again replaces the prior correction", () => {
    setClassificationOverride("PLACEHOLDER GYM CO", "sub", "2026-09-02T00:00:00Z");
    expect(listClassificationOverrides()).toEqual({ "PLACEHOLDER GYM CO": "sub" });
  });

  it("keeps multiple counterparties independently addressable", () => {
    setClassificationOverride("PLACEHOLDER STREAMING CO", "fixed", "2026-09-03T00:00:00Z");
    const overrides = listClassificationOverrides();
    expect(overrides["PLACEHOLDER GYM CO"]).toBe("sub");
    expect(overrides["PLACEHOLDER STREAMING CO"]).toBe("fixed");
  });

  it("rejects a kind outside fixed | sub | variable at runtime, not just in the type system", () => {
    // @ts-expect-error — deliberately passing a value TypeScript already rejects,
    // to prove the runtime guard holds even if a caller bypasses the type.
    expect(() => setClassificationOverride("PLACEHOLDER CO", "premium")).toThrow();
  });

  it("survives a re-sync: upserting already-seen transactions never touches this table", () => {
    const before = listClassificationOverrides();
    upsertBankTransactions([
      {
        transactionId: "tx-1",
        accountUid: "acct-1",
        bookingDate: "2026-09-01",
        amount: "10.00",
        currency: "EUR",
        raw: { credit_debit_indicator: "DBIT" },
      },
    ]);
    // Re-sync: same transaction id, inserted again — a no-op per bank-db.ts's
    // dedup contract, and irrelevant to this table either way since it is
    // keyed by counterparty, never by transaction id.
    upsertBankTransactions([
      {
        transactionId: "tx-1",
        accountUid: "acct-1",
        bookingDate: "2026-09-01",
        amount: "10.00",
        currency: "EUR",
        raw: { credit_debit_indicator: "DBIT" },
      },
    ]);
    expect(listClassificationOverrides()).toEqual(before);
  });
});

describe("clearClassificationOverride", () => {
  it("is reversible: clearing a correction removes it entirely", () => {
    setClassificationOverride("PLACEHOLDER CLEAR CO", "fixed");
    expect(listClassificationOverrides()["PLACEHOLDER CLEAR CO"]).toBe("fixed");
    clearClassificationOverride("PLACEHOLDER CLEAR CO");
    expect(listClassificationOverrides()["PLACEHOLDER CLEAR CO"]).toBeUndefined();
  });

  it("clearing a counterparty with no override does nothing and never throws", () => {
    expect(() => clearClassificationOverride("PLACEHOLDER NEVER SET CO")).not.toThrow();
    expect(listClassificationOverrides()["PLACEHOLDER NEVER SET CO"]).toBeUndefined();
  });

  it("an override for a counterparty absent from all data does nothing and breaks nothing", () => {
    setClassificationOverride("PLACEHOLDER GHOST CO", "sub");
    expect(() => listClassificationOverrides()).not.toThrow();
    expect(listClassificationOverrides()["PLACEHOLDER GHOST CO"]).toBe("sub");
  });
});

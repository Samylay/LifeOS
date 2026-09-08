import { afterAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lifeos-ledger-"));
process.env.LIFEOS_DB_PATH = path.join(directory, "test.db");
const { upsertBankTransactions, listBankTransactionsInRange } = await import("./bank-db");
const { getFinanceOverview } = await import("./finance-overview");
const { saveMerchantLabel, listMerchantLabels, clearMerchantLabel } = await import("./finance-labels-db");
const { POST } = await import("../app/api/finance/labels/route");
afterAll(() => { vi.useRealTimers(); fs.rmSync(directory, { recursive: true, force: true }); });

describe("bank ledger presentation boundary", () => {
  it("keeps currencies separate and uses the same EUR spending as the ledger", () => {
    upsertBankTransactions(["EUR", "USD"].map((currency) => ({ transactionId: `fixture-${currency}`, accountUid: "fixture", bookingDate: "2026-09-01", amount: "25", currency, creditorName: "Example merchant", raw: { credit_debit_indicator: "DBIT" } })));
    const overview = getFinanceOverview(new Date("2026-09-09T10:00:00Z"));
    expect(overview.months.at(-1)?.burn.out).toBe(25);
    expect(overview.activity).toHaveLength(2);
    expect(overview.activity.filter((row) => row.currency === "EUR" && row.included).reduce((sum, row) => sum + row.amount, 0)).toBe(25);
  });
  it("saves a merchant label separately from bank rows and restores the automatic label", () => {
    const before = listBankTransactionsInRange("2026-09", "2026-10");
    const key = getFinanceOverview(new Date("2026-09-09")).activity[0].merchantKey;
    saveMerchantLabel(key, "My shop", "Groceries");
    expect(listMerchantLabels()[key]).toEqual({ label: "My shop", category: "Groceries" });
    expect(getFinanceOverview(new Date("2026-09-09")).activity.every((row) => row.label === "My shop")).toBe(true);
    expect(listBankTransactionsInRange("2026-09", "2026-10")).toEqual(before);
    clearMerchantLabel(key);
    expect(getFinanceOverview(new Date("2026-09-09")).activity[0].label).toBe("Example merchant");
  });
  it("rejects invalid labels and nonexistent source transaction IDs", async () => {
    expect(() => saveMerchantLabel("key", "", "Other")).toThrow();
    expect(() => saveMerchantLabel("key", "label", "made-up")).toThrow();
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-09T10:00:00Z"));
    const response = await POST(new Request("http://localhost/api/finance/labels", { method: "POST", body: JSON.stringify({ transactionId: "missing", label: "hello", category: "Other", amount: 0 }) }));
    expect(response.status).toBe(404);
  });
});

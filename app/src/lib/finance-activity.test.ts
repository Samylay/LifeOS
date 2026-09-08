import { describe, expect, it } from "vitest";
import { financeActivity, formatMoney } from "./finance-activity";

const tx = (id: string, extra = {}) => ({ transactionId: id, accountUid: "fixture", bookingDate: "2026-09-01", amount: "12.34", currency: "EUR", raw: { credit_debit_indicator: "DBIT", remittance_information: ["PRELEVEMENT DE: EXAMPLE SHOP ID: 123"] }, ...extra });
describe("readable bank activity", () => {
  it("uses bank direction for unsigned outgoing amounts and recovers remittance names", () => {
    const [item] = financeActivity([tx("one")]);
    expect(item.label).toBe("EXAMPLE SHOP"); expect(item.direction).toBe("out"); expect(item.amount).toBe(12.34);
  });
  it("uses the sender for income and does not invent direction when absent", () => {
    const rows = financeActivity([tx("in", { debtorName: "Fixture employer", raw: { credit_debit_indicator: "CRDT" } }), tx("unknown", { raw: {} })]);
    expect(rows.find((row) => row.transactionId === "in")).toMatchObject({ label: "Fixture employer", category: "Income", direction: "in" });
    expect(rows.find((row) => row.transactionId === "unknown")).toMatchObject({ category: "Needs review", direction: null, included: false });
  });
  it("keeps transfers out of spending and preserves the original currency", () => {
    const [row] = financeActivity([tx("one", { currency: "USD", creditorName: "To savings" })]);
    expect(row).toMatchObject({ currency: "USD", category: "Transfer", isTransfer: true });
    expect(formatMoney(row.amount, row.currency)).toContain("$");
  });
  it("applies a reusable label without changing source amounts or identity", () => {
    const source = tx("one"); const original = JSON.stringify(source);
    const [base] = financeActivity([source]);
    const [row] = financeActivity([source], [], { [base.merchantKey]: { label: "My local shop", category: "Groceries" } });
    expect(row).toMatchObject({ label: "My local shop", category: "Groceries", amount: 12.34, bankLabel: "EXAMPLE SHOP", merchantKey: base.merchantKey });
    expect(JSON.stringify(source)).toBe(original);
  });
  it("does not merge unknown merchants into one editable label", () => {
    const rows = financeActivity([tx("one", { raw: {} }), tx("two", { raw: {} })]);
    expect(rows[0].merchantKey).not.toBe(rows[1].merchantKey);
  });
});

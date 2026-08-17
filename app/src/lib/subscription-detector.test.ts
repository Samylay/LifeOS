// Fixtures are invented, per finance.test.ts's rule — this repo's remote is
// public and no real merchant/amount/transaction id lands in a commit.
import { describe, it, expect, vi, beforeAll } from "vitest";
import {
  detectRecurringSeries,
  normalizeMerchantKey,
  toSubscriptionProposal,
  normalizeMerchantLabel,
  summarizeSubscriptionHabits,
  type DetectorTransaction,
} from "./subscription-detector";

function tx(over: Partial<DetectorTransaction> & { transactionId: string; merchant: string; amount: number; date: string }): DetectorTransaction {
  return { direction: "out", ...over };
}

describe("detector works without any LLM backend configured", () => {
  beforeAll(() => {
    // The detector must find its answer without GEN_PROVIDER — this is the
    // literal condition T70's verify note names ("must work with
    // GEN_PROVIDER unavailable"). The module never imports claude-cli.ts, so
    // this is really just documenting the guarantee explicitly.
    delete process.env.GEN_PROVIDER;
  });

  it("detects a planted monthly recurring series", () => {
    const txs: DetectorTransaction[] = [
      tx({ transactionId: "t1", merchant: "NETFLIX.COM 34509912", amount: 13.49, date: "2026-01-15" }),
      tx({ transactionId: "t2", merchant: "NETFLIX.COM 88123044", amount: 13.49, date: "2026-02-14" }),
      tx({ transactionId: "t3", merchant: "NETFLIX.COM 12938475", amount: 13.49, date: "2026-03-16" }),
      tx({ transactionId: "t4", merchant: "NETFLIX.COM 55001122", amount: 13.49, date: "2026-04-15" }),
    ];
    const series = detectRecurringSeries(txs);
    expect(series).toHaveLength(1);
    expect(series[0].merchantKey).toBe("NETFLIX COM");
    expect(series[0].cadence).toBe("monthly");
    expect(series[0].amount).toBe(13.49);
    expect(series[0].occurrences).toHaveLength(4);
    expect(series[0].transactionIds).toEqual(["t1", "t2", "t3", "t4"]);
  });

  it("does not flag a known one-off transaction", () => {
    const txs: DetectorTransaction[] = [
      tx({ transactionId: "t1", merchant: "NETFLIX.COM 34509912", amount: 13.49, date: "2026-01-15" }),
      tx({ transactionId: "t2", merchant: "NETFLIX.COM 88123044", amount: 13.49, date: "2026-02-14" }),
      tx({ transactionId: "t3", merchant: "NETFLIX.COM 12938475", amount: 13.49, date: "2026-03-16" }),
      // A single big furniture purchase — same merchant field format, but only one occurrence.
      tx({ transactionId: "t9", merchant: "IKEA FRANCE 99201", amount: 412.0, date: "2026-02-02" }),
    ];
    const series = detectRecurringSeries(txs);
    expect(series).toHaveLength(1);
    expect(series[0].merchantKey).toBe("NETFLIX COM");
    expect(series.some((s) => s.merchantKey.includes("IKEA"))).toBe(false);
  });

  it("does not flag a merchant seen 3+ times at irregular, non-cadence gaps", () => {
    const txs: DetectorTransaction[] = [
      tx({ transactionId: "t1", merchant: "SUMUP *CAFE 111", amount: 4.5, date: "2026-01-03" }),
      tx({ transactionId: "t2", merchant: "SUMUP *CAFE 222", amount: 4.5, date: "2026-01-09" }),
      tx({ transactionId: "t3", merchant: "SUMUP *CAFE 333", amount: 4.5, date: "2026-02-27" }),
    ];
    // Gaps: 6 days, then 49 days — neither weekly nor monthly consistently.
    expect(detectRecurringSeries(txs)).toHaveLength(0);
  });

  it("does not flag a merchant whose amount drifts past tolerance", () => {
    const txs: DetectorTransaction[] = [
      tx({ transactionId: "t1", merchant: "SALLE MUSCU PARIS", amount: 25.0, date: "2026-01-05" }),
      tx({ transactionId: "t2", merchant: "SALLE MUSCU PARIS", amount: 25.0, date: "2026-02-04" }),
      tx({ transactionId: "t3", merchant: "SALLE MUSCU PARIS", amount: 60.0, date: "2026-03-06" }), // price hike, not a wobble
    ];
    expect(detectRecurringSeries(txs)).toHaveLength(0);
  });

  it("tolerates small VAT/FX wobble within the amount tolerance", () => {
    const txs: DetectorTransaction[] = [
      tx({ transactionId: "t1", merchant: "SPOTIFY", amount: 11.99, date: "2026-01-10" }),
      tx({ transactionId: "t2", merchant: "SPOTIFY", amount: 12.02, date: "2026-02-09" }),
      tx({ transactionId: "t3", merchant: "SPOTIFY", amount: 11.97, date: "2026-03-11" }),
    ];
    const series = detectRecurringSeries(txs);
    expect(series).toHaveLength(1);
    expect(series[0].cadence).toBe("monthly");
  });

  it("detects a yearly series and a weekly series independently by direction/kind", () => {
    const txs: DetectorTransaction[] = [
      tx({ transactionId: "y1", merchant: "ADOBE INC", amount: 71.88, date: "2025-08-01" }),
      tx({ transactionId: "y2", merchant: "ADOBE INC", amount: 71.88, date: "2026-07-30" }),
      tx({ transactionId: "y3", merchant: "ADOBE INC", amount: 71.88, date: "2027-08-05" }),
      tx({ transactionId: "w1", merchant: "MARCHE BIO", amount: 22.0, date: "2026-01-03" }),
      tx({ transactionId: "w2", merchant: "MARCHE BIO", amount: 22.0, date: "2026-01-10" }),
      tx({ transactionId: "w3", merchant: "MARCHE BIO", amount: 22.0, date: "2026-01-17" }),
    ];
    const series = detectRecurringSeries(txs);
    expect(series.map((s) => s.cadence).sort()).toEqual(["weekly", "yearly"]);
  });

  it("requires minOccurrences, configurable", () => {
    const txs: DetectorTransaction[] = [
      tx({ transactionId: "t1", merchant: "GYM CO", amount: 30, date: "2026-01-05" }),
      tx({ transactionId: "t2", merchant: "GYM CO", amount: 30, date: "2026-02-04" }),
    ];
    expect(detectRecurringSeries(txs)).toHaveLength(0);
    expect(detectRecurringSeries(txs, { minOccurrences: 2 })).toHaveLength(1);
  });
});

describe("normalizeMerchantKey", () => {
  it("groups the same merchant across different trailing reference numbers", () => {
    expect(normalizeMerchantKey("SUMUP *CAFE 12345")).toBe(normalizeMerchantKey("SUMUP *CAFE 67890"));
  });

  it("strips common card-processor prefixes", () => {
    expect(normalizeMerchantKey("CB NETFLIX.COM")).toBe(normalizeMerchantKey("NETFLIX.COM"));
    expect(normalizeMerchantKey("PAYPAL *SPOTIFY")).toBe(normalizeMerchantKey("SPOTIFY"));
  });

  it("keeps genuinely different merchants apart", () => {
    expect(normalizeMerchantKey("NETFLIX.COM")).not.toBe(normalizeMerchantKey("SPOTIFY"));
  });
});

describe("toSubscriptionProposal", () => {
  it("maps a detected series into finance.ts's flow vocabulary", () => {
    const txs: DetectorTransaction[] = [
      tx({ transactionId: "t1", merchant: "NETFLIX.COM", amount: 13.49, date: "2026-01-15" }),
      tx({ transactionId: "t2", merchant: "NETFLIX.COM", amount: 13.49, date: "2026-02-14" }),
      tx({ transactionId: "t3", merchant: "NETFLIX.COM", amount: 13.49, date: "2026-03-16" }),
    ];
    const proposal = toSubscriptionProposal(detectRecurringSeries(txs)[0]);
    expect(proposal.kind).toBe("sub");
    expect(proposal.cadence).toBe("monthly");
    expect(proposal.direction).toBe("out");
    expect(proposal.occurrenceCount).toBe(3);
    expect(proposal.transactionIds).toEqual(["t1", "t2", "t3"]);
  });

  it("infers 'fixed' for rent-like recurring outgoings, matching finance.ts's own keyword list", () => {
    const txs: DetectorTransaction[] = [
      tx({ transactionId: "t1", merchant: "LOYER APPARTEMENT", amount: 650, date: "2026-01-01" }),
      tx({ transactionId: "t2", merchant: "LOYER APPARTEMENT", amount: 650, date: "2026-02-01" }),
      tx({ transactionId: "t3", merchant: "LOYER APPARTEMENT", amount: 650, date: "2026-03-01" }),
    ];
    const proposal = toSubscriptionProposal(detectRecurringSeries(txs)[0]);
    expect(proposal.kind).toBe("fixed");
  });
});

describe("LLM layer (stubbed generate, never calls claude-cli.ts)", () => {
  it("normalizes a merchant label via the injected generate function", async () => {
    const generate = vi.fn().mockResolvedValue({ label: "Coffee shop" });
    const label = await normalizeMerchantLabel("SUMUP *CAFE 12345", generate);
    expect(label).toBe("Coffee shop");
    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate.mock.calls[0][0]).toContain("SUMUP *CAFE 12345");
  });

  it("falls back to the raw label when the model returns nothing usable", async () => {
    const generate = vi.fn().mockResolvedValue({});
    expect(await normalizeMerchantLabel("WEIRD MERCHANT 555", generate)).toBe("WEIRD MERCHANT 555");
  });

  it("falls back to the raw label when the model call throws", async () => {
    const generate = vi.fn().mockRejectedValue(new Error("claude usage limit reached"));
    expect(await normalizeMerchantLabel("WEIRD MERCHANT 555", generate)).toBe("WEIRD MERCHANT 555");
  });

  it("summarizes habits from detected proposals, capped at 3 lines", async () => {
    const generate = vi.fn().mockResolvedValue({
      lines: ["Line one.", "Line two.", "Line three.", "Line four should be dropped."],
    });
    const proposals = [
      toSubscriptionProposal(
        detectRecurringSeries([
          tx({ transactionId: "t1", merchant: "NETFLIX.COM", amount: 13.49, date: "2026-01-15" }),
          tx({ transactionId: "t2", merchant: "NETFLIX.COM", amount: 13.49, date: "2026-02-14" }),
          tx({ transactionId: "t3", merchant: "NETFLIX.COM", amount: 13.49, date: "2026-03-16" }),
        ])[0]
      ),
    ];
    const lines = await summarizeSubscriptionHabits(proposals, generate);
    expect(lines).toHaveLength(3);
    expect(lines).toEqual(["Line one.", "Line two.", "Line three."]);
  });

  it("returns no lines (never throws) when there is nothing detected", async () => {
    const generate = vi.fn();
    expect(await summarizeSubscriptionHabits([], generate)).toEqual([]);
    expect(generate).not.toHaveBeenCalled();
  });

  it("returns an empty array rather than throwing when the model call fails", async () => {
    const generate = vi.fn().mockRejectedValue(new Error("usage limit reached"));
    const proposals = [
      toSubscriptionProposal(
        detectRecurringSeries([
          tx({ transactionId: "t1", merchant: "NETFLIX.COM", amount: 13.49, date: "2026-01-15" }),
          tx({ transactionId: "t2", merchant: "NETFLIX.COM", amount: 13.49, date: "2026-02-14" }),
          tx({ transactionId: "t3", merchant: "NETFLIX.COM", amount: 13.49, date: "2026-03-16" }),
        ])[0]
      ),
    ];
    expect(await summarizeSubscriptionHabits(proposals, generate)).toEqual([]);
  });
});

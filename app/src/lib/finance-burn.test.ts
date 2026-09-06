// Fixtures are invented — this repo's remote is public and finance's first
// standing rule is that no real amount, merchant, transaction id or balance
// lands in a commit, including in a test. Shapes mirror the live Enable
// Banking payload verified 2026-09-06: an unsigned `amount` string, direction
// carried only by `raw.credit_debit_indicator` ("CRDT" | "DBIT"), never by
// the amount's sign or by which of creditor/debtor is populated.
import { describe, it, expect } from "vitest";
import {
  classify,
  deriveDirection,
  detectRecurring,
  monthlyBurn,
  type BankTransactionLike,
} from "./finance-burn";
import { detectRecurringSeries, type DetectorTransaction } from "./subscription-detector";

function out(over: {
  transactionId: string;
  amount: string;
  date: string;
  creditorName: string;
}): BankTransactionLike {
  return {
    transactionId: over.transactionId,
    bookingDate: over.date,
    amount: over.amount,
    creditorName: over.creditorName,
    raw: { credit_debit_indicator: "DBIT" },
  };
}

function income(over: { transactionId: string; amount: string; date: string; debtorName: string }): BankTransactionLike {
  return {
    transactionId: over.transactionId,
    bookingDate: over.date,
    amount: over.amount,
    debtorName: over.debtorName,
    raw: { credit_debit_indicator: "CRDT" },
  };
}

// Société Générale sends outgoing rows with NULL creditor_name — the
// counterparty lives only in the free-text remittance field. Shapes below
// mirror the live payload verified 2026-09-06 (CAUSE 1); a placeholder
// account-holder name stands in for Samy's real one.
function outNoCreditor(over: { transactionId: string; amount: string; date: string; remittance: string }): BankTransactionLike {
  return {
    transactionId: over.transactionId,
    bookingDate: over.date,
    amount: over.amount,
    creditorName: null,
    raw: { credit_debit_indicator: "DBIT", remittance_information: [over.remittance] },
  };
}

describe("deriveDirection", () => {
  // The whole reason this module exists: the indicator lives only in the raw
  // payload, verified against the live data 2026-09-06, not in a column.
  it("reads CRDT as money in and DBIT as money out", () => {
    expect(deriveDirection({ credit_debit_indicator: "CRDT" })).toBe("in");
    expect(deriveDirection({ credit_debit_indicator: "DBIT" })).toBe("out");
  });

  it("is case-insensitive, since aggregators are not consistent about it", () => {
    expect(deriveDirection({ credit_debit_indicator: "dbit" })).toBe("out");
  });

  // The core money-safety rule: an indicator that isn't there, or isn't one
  // of the two known values, must never resolve to a guessed direction.
  it("returns null rather than guessing when the indicator is missing", () => {
    expect(deriveDirection({})).toBeNull();
    expect(deriveDirection(null)).toBeNull();
    expect(deriveDirection(undefined)).toBeNull();
    expect(deriveDirection("not an object")).toBeNull();
  });

  it("returns null on an unrecognised indicator value rather than defaulting to out", () => {
    expect(deriveDirection({ credit_debit_indicator: "XXXX" })).toBeNull();
  });
});

describe("monthlyBurn — arithmetic", () => {
  it("sums a fixture month's transactions into fixed + sub + variable == out", () => {
    const transactions: BankTransactionLike[] = [
      // Rent: 3 monthly occurrences at a steady amount -> detected, "fixed" by keyword.
      out({ transactionId: "r1", amount: "650.00", date: "2026-06-01", creditorName: "LOYER APPARTEMENT" }),
      out({ transactionId: "r2", amount: "650.00", date: "2026-07-01", creditorName: "LOYER APPARTEMENT" }),
      out({ transactionId: "r3", amount: "650.00", date: "2026-08-01", creditorName: "LOYER APPARTEMENT" }),
      // Netflix: 3 monthly occurrences at a steady amount -> detected, "sub" by keyword.
      out({ transactionId: "n1", amount: "13.49", date: "2026-06-15", creditorName: "NETFLIX.COM 1111" }),
      out({ transactionId: "n2", amount: "13.49", date: "2026-07-15", creditorName: "NETFLIX.COM 2222" }),
      out({ transactionId: "n3", amount: "13.49", date: "2026-08-15", creditorName: "NETFLIX.COM 3333" }),
      // A single grocery run in the target month — not recurring, falls to variable.
      out({ transactionId: "g1", amount: "42.17", date: "2026-08-10", creditorName: "CARREFOUR CITY" }),
      // Salary, same month — counted into `in`, never mixed into the spend split.
      income({ transactionId: "s1", amount: "2200.00", date: "2026-08-05", debtorName: "EMPLOYER SAS" }),
    ];

    const { burn } = monthlyBurn(transactions, "2026-08");

    expect(burn.month).toBe("2026-08");
    expect(burn.fixed).toBeCloseTo(650.0, 2);
    expect(burn.sub).toBeCloseTo(13.49, 2);
    expect(burn.variable).toBeCloseTo(42.17, 2);
    expect(burn.out).toBeCloseTo(650.0 + 13.49 + 42.17, 2);
    expect(burn.fixed + burn.sub + burn.variable).toBeCloseTo(burn.out, 2);
    expect(burn.in).toBeCloseTo(2200.0, 2);
    // Only August's 4 transactions count, not June's or July's rent/Netflix rows.
    expect(burn.txCount).toBe(4);
  });

  it("yields a burn of zero, not an error, for a month with no transactions", () => {
    const { burn, recurring, undetermined } = monthlyBurn([], "2026-08");
    expect(burn).toEqual({
      month: "2026-08",
      out: 0,
      in: 0,
      fixed: 0,
      sub: 0,
      variable: 0,
      transfer: 0,
      txCount: 0,
    });
    expect(recurring).toEqual([]);
    expect(undetermined).toEqual([]);
  });

  it("yields a burn of zero for a month present in history but with nothing booked in it", () => {
    const transactions: BankTransactionLike[] = [
      out({ transactionId: "a1", amount: "10.00", date: "2026-07-01", creditorName: "SHOP" }),
    ];
    const { burn } = monthlyBurn(transactions, "2026-08");
    expect(burn.out).toBe(0);
    expect(burn.txCount).toBe(0);
  });

  it("never lets an undeterminable direction get silently counted as spend", () => {
    const transactions: BankTransactionLike[] = [
      out({ transactionId: "a1", amount: "10.00", date: "2026-08-01", creditorName: "SHOP" }),
      // Raw payload missing the indicator entirely — real aggregator noise.
      {
        transactionId: "a2",
        bookingDate: "2026-08-02",
        amount: "999.00",
        creditorName: "MYSTERY MERCHANT",
        raw: {},
      },
    ];
    const { burn, undetermined } = monthlyBurn(transactions, "2026-08");
    // The 999.00 undeterminable row must not have inflated `out`.
    expect(burn.out).toBeCloseTo(10.0, 2);
    expect(burn.txCount).toBe(1);
    expect(undetermined).toHaveLength(1);
    expect(undetermined[0].transactionId).toBe("a2");
  });

  it("rounds to the cent and never drifts across many small transactions", () => {
    // 0.10 + 0.20 is the classic float trap (0.30000000000000004 in raw JS).
    const transactions: BankTransactionLike[] = [
      out({ transactionId: "c1", amount: "0.10", date: "2026-08-01", creditorName: "A" }),
      out({ transactionId: "c2", amount: "0.20", date: "2026-08-02", creditorName: "B" }),
    ];
    const { burn } = monthlyBurn(transactions, "2026-08");
    expect(burn.out).toBe(0.3);
  });
});

describe("monthlyBurn — recurrence needs the full history, not just the target month", () => {
  it("classifies a charge as recurring using occurrences from other months", () => {
    const transactions: BankTransactionLike[] = [
      out({ transactionId: "n1", amount: "13.49", date: "2026-06-15", creditorName: "NETFLIX.COM 1111" }),
      out({ transactionId: "n2", amount: "13.49", date: "2026-07-15", creditorName: "NETFLIX.COM 2222" }),
      out({ transactionId: "n3", amount: "13.49", date: "2026-08-15", creditorName: "NETFLIX.COM 3333" }),
    ];
    const { burn, recurring } = monthlyBurn(transactions, "2026-08");
    expect(burn.sub).toBeCloseTo(13.49, 2);
    expect(recurring).toHaveLength(1);
    expect(recurring[0].cadence).toBe("monthly");
  });

  it("only reports recurring charges that actually occurred in the target month", () => {
    const transactions: BankTransactionLike[] = [
      out({ transactionId: "n1", amount: "13.49", date: "2026-04-15", creditorName: "NETFLIX.COM 1111" }),
      out({ transactionId: "n2", amount: "13.49", date: "2026-05-15", creditorName: "NETFLIX.COM 2222" }),
      out({ transactionId: "n3", amount: "13.49", date: "2026-06-15", creditorName: "NETFLIX.COM 3333" }),
      // A grocery run in August, no recurrence.
      out({ transactionId: "g1", amount: "20.00", date: "2026-08-10", creditorName: "CARREFOUR CITY" }),
    ];
    const { recurring } = monthlyBurn(transactions, "2026-08");
    expect(recurring).toEqual([]);
  });
});

describe("classify + overrides", () => {
  function series(overrides: Partial<DetectorTransaction> = {}) {
    const txs: DetectorTransaction[] = [
      { transactionId: "t1", merchant: "GENERIC SUB CO", amount: 9.99, direction: "out", date: "2026-01-10", ...overrides },
      { transactionId: "t2", merchant: "GENERIC SUB CO", amount: 9.99, direction: "out", date: "2026-02-09" },
      { transactionId: "t3", merchant: "GENERIC SUB CO", amount: 9.99, direction: "out", date: "2026-03-11" },
    ];
    return detectRecurringSeries(txs)[0];
  }

  it("falls back to inferKind's guess with no override", () => {
    expect(classify(series())).toBe("sub"); // unmatched keyword, recurring outgoing -> inferKind defaults to "sub"
  });

  it("an override on the counterparty wins over the module's own classification", () => {
    expect(classify(series(), { "GENERIC SUB CO": "fixed" })).toBe("fixed");
  });

  it("a correction applies to the burn split for that counterparty's future transactions", () => {
    const transactions: BankTransactionLike[] = [
      out({ transactionId: "t1", amount: "9.99", date: "2026-06-10", creditorName: "GENERIC SUB CO" }),
      out({ transactionId: "t2", amount: "9.99", date: "2026-07-09", creditorName: "GENERIC SUB CO" }),
      out({ transactionId: "t3", amount: "9.99", date: "2026-08-11", creditorName: "GENERIC SUB CO" }),
    ];
    const withoutOverride = monthlyBurn(transactions, "2026-08");
    expect(withoutOverride.burn.sub).toBeCloseTo(9.99, 2);
    expect(withoutOverride.burn.fixed).toBe(0);

    const withOverride = monthlyBurn(transactions, "2026-08", { "GENERIC SUB CO": "fixed" });
    expect(withOverride.burn.fixed).toBeCloseTo(9.99, 2);
    expect(withOverride.burn.sub).toBe(0);
    expect(withOverride.recurring[0].overridden).toBe(true);
  });
});

describe("detectRecurring — cadence, tolerance and reporting (thin wrapper over subscription-detector)", () => {
  it("reports cadence, typical amount, first/last seen and a confidence for a detected charge", () => {
    const transactions: BankTransactionLike[] = [
      out({ transactionId: "n1", amount: "13.49", date: "2026-06-15", creditorName: "NETFLIX.COM 1111" }),
      out({ transactionId: "n2", amount: "13.49", date: "2026-07-15", creditorName: "NETFLIX.COM 2222" }),
      out({ transactionId: "n3", amount: "13.49", date: "2026-08-15", creditorName: "NETFLIX.COM 3333" }),
    ];
    const { charges } = detectRecurring(transactions);
    expect(charges).toHaveLength(1);
    const [charge] = charges;
    expect(charge.cadence).toBe("monthly");
    expect(charge.amount).toBeCloseTo(13.49, 2);
    expect(charge.firstSeen).toBe("2026-06-15");
    expect(charge.lastSeen).toBe("2026-08-15");
    expect(charge.confidence).toBeGreaterThan(0);
    expect(charge.confidence).toBeLessThan(1);
  });

  it("does not flag the same counterparty at irregular intervals", () => {
    const transactions: BankTransactionLike[] = [
      out({ transactionId: "c1", amount: "4.50", date: "2026-01-03", creditorName: "SUMUP *CAFE 111" }),
      out({ transactionId: "c2", amount: "4.50", date: "2026-01-09", creditorName: "SUMUP *CAFE 222" }),
      out({ transactionId: "c3", amount: "4.50", date: "2026-02-27", creditorName: "SUMUP *CAFE 333" }),
    ];
    expect(detectRecurring(transactions).charges).toEqual([]);
  });

  it("groups counterparty strings that differ only by a trailing reference number", () => {
    const transactions: BankTransactionLike[] = [
      out({ transactionId: "n1", amount: "13.49", date: "2026-06-15", creditorName: "NETFLIX.COM 34509912" }),
      out({ transactionId: "n2", amount: "13.49", date: "2026-07-15", creditorName: "NETFLIX.COM 88123044" }),
      out({ transactionId: "n3", amount: "13.49", date: "2026-08-15", creditorName: "NETFLIX.COM 12938475" }),
    ];
    expect(detectRecurring(transactions).charges).toHaveLength(1);
  });

  it("keeps a gradual price rise as one charge rather than splitting it in two", () => {
    // Within the detector's 5%/€0.50 tolerance band around the median.
    const transactions: BankTransactionLike[] = [
      out({ transactionId: "s1", amount: "11.99", date: "2026-01-10", creditorName: "SPOTIFY" }),
      out({ transactionId: "s2", amount: "12.02", date: "2026-02-09", creditorName: "SPOTIFY" }),
      out({ transactionId: "s3", amount: "11.97", date: "2026-03-11", creditorName: "SPOTIFY" }),
    ];
    const { charges } = detectRecurring(transactions);
    expect(charges).toHaveLength(1);
    expect(charges[0].occurrenceCount).toBe(3);
  });

  it("surfaces every undeterminable-direction transaction across the whole input, not just one month", () => {
    const transactions: BankTransactionLike[] = [
      { transactionId: "u1", bookingDate: "2026-06-01", amount: "5.00", raw: null },
      { transactionId: "u2", bookingDate: "2026-07-01", amount: "5.00", raw: { credit_debit_indicator: "???" } },
    ];
    const { undetermined } = detectRecurring(transactions);
    expect(undetermined.map((u) => u.transactionId).sort()).toEqual(["u1", "u2"]);
  });
});

describe("merchant fallback from remittance_information (CAUSE 1)", () => {
  it("derives a real merchant key from the SEPA direct-debit 'DE:' label when creditor_name is null", () => {
    const transactions: BankTransactionLike[] = [
      outNoCreditor({
        transactionId: "rent1",
        amount: "845.14",
        date: "2026-03-04",
        remittance: "PRELEVEMENT EUROPEEN 3816317483 DE: NEXITY STUDEA ID: FR00ZZZ000001 MOTIF: QUITTANCE 01/03",
      }),
      outNoCreditor({
        transactionId: "rent2",
        amount: "845.14",
        date: "2026-04-04",
        remittance: "PRELEVEMENT EUROPEEN 9912384710 DE: NEXITY STUDEA ID: FR00ZZZ000001 MOTIF: QUITTANCE 01/04",
      }),
      outNoCreditor({
        transactionId: "rent3",
        amount: "845.14",
        date: "2026-05-04",
        remittance: "PRELEVEMENT EUROPEEN 1123958123 DE: NEXITY STUDEA ID: FR00ZZZ000001 MOTIF: QUITTANCE 01/05",
      }),
    ];
    const { charges } = detectRecurring(transactions);
    expect(charges).toHaveLength(1);
    expect(charges[0].label).toContain("NEXITY STUDEA");
    expect(charges[0].amount).toBeCloseTo(845.14, 2);
    expect(charges[0].cadence).toBe("monthly");
  });

  it("falls back to the whole remittance text when there is no DE:/POUR: label (a bank-fee line)", () => {
    const transactions: BankTransactionLike[] = [
      outNoCreditor({ transactionId: "f1", amount: "3.50", date: "2026-03-15", remittance: "COTISATION MENSUELLE SOBRIO" }),
      outNoCreditor({ transactionId: "f2", amount: "3.50", date: "2026-04-15", remittance: "COTISATION MENSUELLE SOBRIO" }),
      outNoCreditor({ transactionId: "f3", amount: "3.50", date: "2026-05-15", remittance: "COTISATION MENSUELLE SOBRIO" }),
    ];
    const { charges } = detectRecurring(transactions);
    expect(charges).toHaveLength(1);
    expect(charges[0].label).toBe("COTISATION MENSUELLE SOBRIO");
  });

  it("never leaves a null-creditor row as UNKNOWN when remittance_information is present", () => {
    const transactions: BankTransactionLike[] = [
      outNoCreditor({
        transactionId: "single1",
        amount: "12.99",
        date: "2026-04-10",
        remittance: "PRELEVEMENT EUROPEEN 1234567890 DE: ORANGE ID: FR00ZZZ000002 MOTIF: FACTURE",
      }),
      outNoCreditor({
        transactionId: "single2",
        amount: "12.99",
        date: "2026-05-10",
        remittance: "PRELEVEMENT EUROPEEN 2234567891 DE: ORANGE ID: FR00ZZZ000002 MOTIF: FACTURE",
      }),
      outNoCreditor({
        transactionId: "single3",
        amount: "12.99",
        date: "2026-06-10",
        remittance: "PRELEVEMENT EUROPEEN 3234567892 DE: ORANGE ID: FR00ZZZ000002 MOTIF: FACTURE",
      }),
    ];
    const { charges } = detectRecurring(transactions);
    expect(charges).toHaveLength(1);
    expect(charges[0].merchantKey).not.toBe("UNKNOWN");
    expect(charges[0].label).toContain("ORANGE");
  });

  it("only falls back to remittance_information when creditor_name/debtor_name is genuinely empty", () => {
    const withName = out({ transactionId: "n1", amount: "9.99", date: "2026-04-01", creditorName: "REAL MERCHANT NAME" });
    // Attach remittance info too — the named field must still win.
    (withName.raw as { remittance_information?: string[] }).remittance_information = ["DE: DIFFERENT MERCHANT"];
    const { charges } = detectRecurring([
      withName,
      out({ transactionId: "n2", amount: "9.99", date: "2026-05-01", creditorName: "REAL MERCHANT NAME" }),
      out({ transactionId: "n3", amount: "9.99", date: "2026-06-01", creditorName: "REAL MERCHANT NAME" }),
    ]);
    expect(charges).toHaveLength(1);
    expect(charges[0].label).toBe("REAL MERCHANT NAME");
  });
});

describe("transfer bucket — self-transfers and internal moves excluded from spend (CAUSE 2)", () => {
  it("routes a transfer to another account Samy holds into `transfer`, not `variable`", () => {
    const transactions: BankTransactionLike[] = [
      out({
        transactionId: "t1",
        amount: "4500.00",
        date: "2026-04-12",
        creditorName: "VIR EUROPEEN EMIS POUR: PLACEHOLDER HOLDER NAME",
      }),
      out({ transactionId: "g1", amount: "40.00", date: "2026-04-13", creditorName: "CARREFOUR CITY" }),
    ];
    const { burn } = monthlyBurn(transactions, "2026-04", {}, ["PLACEHOLDER HOLDER NAME"]);
    expect(burn.transfer).toBeCloseTo(4500.0, 2);
    expect(burn.variable).toBeCloseTo(40.0, 2);
    expect(burn.out).toBeCloseTo(40.0, 2);
    // The invariant: fixed + sub + variable === out, and it excludes transfer.
    expect(burn.fixed + burn.sub + burn.variable).toBeCloseTo(burn.out, 2);
  });

  it("routes a Revolut internal pocket move ('To Robo portfolio') into `transfer` with no own-identifier configured", () => {
    const transactions: BankTransactionLike[] = [
      out({ transactionId: "r1", amount: "2.13", date: "2026-04-01", creditorName: "To Robo portfolio" }),
      out({ transactionId: "r2", amount: "1.87", date: "2026-04-05", creditorName: "To Robo portfolio" }),
      out({ transactionId: "g1", amount: "25.00", date: "2026-04-06", creditorName: "CARREFOUR CITY" }),
    ];
    const { burn } = monthlyBurn(transactions, "2026-04");
    expect(burn.transfer).toBeCloseTo(2.13 + 1.87, 2);
    expect(burn.variable).toBeCloseTo(25.0, 2);
    expect(burn.out).toBeCloseTo(25.0, 2);
  });

  it("never lets a self-transfer amount leak into `out`, `in`, or the recurring-charge list", () => {
    const transactions: BankTransactionLike[] = [
      out({
        transactionId: "s1",
        amount: "9000.00",
        date: "2026-04-02",
        creditorName: "VIR EUROPEEN EMIS POUR: PLACEHOLDER HOLDER NAME",
      }),
    ];
    const { burn, recurring } = monthlyBurn(transactions, "2026-04", {}, ["PLACEHOLDER HOLDER NAME"]);
    expect(burn.out).toBe(0);
    expect(burn.in).toBe(0);
    expect(burn.variable).toBe(0);
    expect(recurring).toEqual([]);
  });

  it("keeps the bucket invariant in integer cents across a mixed month", () => {
    const transactions: BankTransactionLike[] = [
      out({ transactionId: "rent", amount: "845.14", date: "2026-04-04", creditorName: "LOYER APPARTEMENT" }),
      out({
        transactionId: "transfer1",
        amount: "4500.00",
        date: "2026-04-05",
        creditorName: "VIR EUROPEEN EMIS POUR: PLACEHOLDER HOLDER NAME",
      }),
      out({ transactionId: "roundup1", amount: "1.23", date: "2026-04-06", creditorName: "To Robo portfolio" }),
      out({ transactionId: "shop1", amount: "37.42", date: "2026-04-07", creditorName: "CARREFOUR CITY" }),
      income({ transactionId: "salary", amount: "2200.00", date: "2026-04-03", debtorName: "EMPLOYER SAS" }),
    ];
    const { burn } = monthlyBurn(transactions, "2026-04", {}, ["PLACEHOLDER HOLDER NAME"]);
    expect(burn.fixed + burn.sub + burn.variable).toBeCloseTo(burn.out, 2);
    expect(burn.out).toBeCloseTo(845.14 + 37.42, 2);
    expect(burn.transfer).toBeCloseTo(4500.0 + 1.23, 2);
    expect(burn.in).toBeCloseTo(2200.0, 2);
  });
});

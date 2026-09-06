// Burn and recurrence — the missing half of ROADMAP finance-rework ticket 01.
//
// subscription-detector.ts already answers "does this merchant recur, and at
// what cadence" (merchant-key normalization, cadence from date gaps, amount
// tolerance — T70, tested, not rewritten here). What was missing:
//   1. Turning a detected series into fixed | sub | variable for the burn
//      split, with an override able to win over the guess.
//   2. Deriving money-in-vs-money-out from what the bank actually recorded,
//      because the indicator is not a column — see below.
//   3. Rolling a month of transactions into the BurnMonth the spec pins down.
//
// Pure module: no filesystem, no network, no database. Every function here
// takes plain data in and returns plain data out.
import type { FlowCadence, FlowDirection, FlowKind } from "./finance";
import { inferKind } from "./finance";
import {
  detectRecurringSeries,
  normalizeMerchantKey,
  type DetectorTransaction,
  type RecurringSeries,
} from "./subscription-detector";

// --- Input shape --------------------------------------------------------
//
// bank_transactions has no credit/debit column (see bank-db.ts's schema) —
// enable-banking.ts stores the aggregator's whole transaction object as
// `raw_json`, and only that raw object carries `credit_debit_indicator`
// ("CRDT" | "DBIT", Berlin Group / NextGenPSD2 convention). Verified against
// the live data 2026-09-06: Société Générale sends unsigned amount strings
// ("12.00", never "-12.00") and relies entirely on the indicator for sign —
// so a caller that infers direction from the amount's sign, or from which of
// creditor/debtor is populated, will get it wrong on this connection.

/** Shape a caller (bank-db row, a fixture, a test) hands in — deliberately
 * loose on `raw` because it's aggregator/bank-specific and this module reads
 * exactly one documented field out of it. */
export interface BankTransactionLike {
  transactionId: string;
  /** ISO date, YYYY-MM-DD. Null is possible (an unbooked/pending row) and is
   * treated the same as an undeterminable transaction — never dated as "now". */
  bookingDate: string | null;
  /** As the bank sends it — a decimal string, unsigned on this connection. */
  amount: string;
  creditorName?: string | null;
  debtorName?: string | null;
  /** The aggregator's raw transaction object. Read-only: this module never
   * mutates or re-serialises it. */
  raw: unknown;
}

export interface UndeterminedTransaction {
  transactionId: string;
  bookingDate: string | null;
  reason: string;
}

/** A correction, keyed by the same normalized counterparty subscription-
 * detector.ts groups on. Never carries an amount — spec.md is explicit that
 * overrides fix a classification, not a number. */
export type ClassificationOverrides = Record<string, FlowKind>;

export interface RecurringCharge {
  merchantKey: string;
  /** Most recent raw counterparty string, for display. */
  label: string;
  direction: FlowDirection;
  cadence: Exclude<FlowCadence, "oneoff">;
  /** Median amount across occurrences (always positive). */
  amount: number;
  kind: FlowKind;
  firstSeen: string;
  lastSeen: string;
  /** 0–1. Rises with how many occurrences confirm the cadence; never claims
   * certainty (capped below 1) because three points is a pattern, not proof. */
  confidence: number;
  occurrenceCount: number;
  /** True when `kind` came from an override rather than `inferKind`'s guess. */
  overridden: boolean;
}

export interface BurnMonth {
  month: string; // YYYY-MM
  out: number; // total money out that month
  in: number; // total money in that month
  fixed: number; // recurring, hard to cancel
  sub: number; // recurring, cancellable
  variable: number; // everything else
  txCount: number; // transactions counted into `out` + `in` this month
}

export interface MonthlyBurnResult {
  burn: BurnMonth;
  /** Recurring charges that had at least one occurrence in this month —
   * what ticket 03's "recurring charges visible" surface reads. */
  recurring: RecurringCharge[];
  /** Transactions dated in this month whose direction could not be derived.
   * Excluded from `burn` entirely — never guessed into `out`. */
  undetermined: UndeterminedTransaction[];
}

// --- Direction ------------------------------------------------------------

function creditDebitIndicator(raw: unknown): string | null {
  if (raw && typeof raw === "object" && "credit_debit_indicator" in raw) {
    const value = (raw as { credit_debit_indicator?: unknown }).credit_debit_indicator;
    return typeof value === "string" ? value.toUpperCase() : null;
  }
  return null;
}

/**
 * CRDT = money in, DBIT = money out (Berlin Group). Anything else — missing
 * field, unrecognised value, a raw payload that isn't an object — returns
 * null rather than a guess. Exported so a later ticket can reuse the same
 * rule outside this module without re-deriving it.
 */
export function deriveDirection(raw: unknown): FlowDirection | null {
  const indicator = creditDebitIndicator(raw);
  if (indicator === "CRDT") return "in";
  if (indicator === "DBIT") return "out";
  return null;
}

interface Converted {
  detectorTx: DetectorTransaction;
}
interface NotConverted {
  undetermined: UndeterminedTransaction;
}

function convert(tx: BankTransactionLike): Converted | NotConverted {
  const direction = deriveDirection(tx.raw);
  if (!direction) {
    return {
      undetermined: {
        transactionId: tx.transactionId,
        bookingDate: tx.bookingDate,
        reason: "missing or unrecognised credit_debit_indicator",
      },
    };
  }
  if (!tx.bookingDate) {
    return {
      undetermined: { transactionId: tx.transactionId, bookingDate: null, reason: "missing booking date" },
    };
  }
  const amount = Number(tx.amount);
  if (!Number.isFinite(amount)) {
    return {
      undetermined: {
        transactionId: tx.transactionId,
        bookingDate: tx.bookingDate,
        reason: `amount "${tx.amount}" is not a parseable number`,
      },
    };
  }
  // Money in comes from a debtor (who sent it), money out goes to a creditor
  // (who received it) — same convention subscription-detector.ts's
  // DetectorTransaction already documents. Always positive; direction is the
  // only carrier of sign, per finance.ts's house rule.
  const merchant = (direction === "out" ? tx.creditorName : tx.debtorName)?.trim();
  return {
    detectorTx: {
      transactionId: tx.transactionId,
      merchant: merchant || "UNKNOWN",
      amount: Math.abs(amount),
      direction,
      date: tx.bookingDate,
    },
  };
}

function splitTransactions(transactions: BankTransactionLike[]): {
  detectorTxs: DetectorTransaction[];
  undetermined: UndeterminedTransaction[];
} {
  const detectorTxs: DetectorTransaction[] = [];
  const undetermined: UndeterminedTransaction[] = [];
  for (const tx of transactions) {
    const result = convert(tx);
    if ("detectorTx" in result) detectorTxs.push(result.detectorTx);
    else undetermined.push(result.undetermined);
  }
  return { detectorTxs, undetermined };
}

// --- Recurrence + classification ------------------------------------------

/**
 * More confirmed occurrences is more evidence the cadence is real rather
 * than coincidence. Starts at the detector's own floor (3 occurrences, since
 * two points can't confirm a cadence) and is capped short of 1 — a
 * deterministic detector still never claims certainty about the future.
 */
function computeConfidence(series: RecurringSeries): number {
  const raw = 0.6 + (series.occurrences.length - 3) * 0.1;
  return Math.round(Math.min(raw, 0.95) * 100) / 100;
}

/** Overrides win over the detector's own guess. Kept as its own function
 * because ticket 01 names it explicitly: "classify(group)". */
export function classify(series: RecurringSeries, overrides: ClassificationOverrides = {}): FlowKind {
  return overrides[series.merchantKey] ?? inferKind(series.merchantRaw, series.direction, series.cadence);
}

function toRecurringCharge(series: RecurringSeries, overrides: ClassificationOverrides): RecurringCharge {
  return {
    merchantKey: series.merchantKey,
    label: series.merchantRaw,
    direction: series.direction,
    cadence: series.cadence,
    amount: series.amount,
    kind: classify(series, overrides),
    firstSeen: series.firstSeen,
    lastSeen: series.lastSeen,
    confidence: computeConfidence(series),
    occurrenceCount: series.occurrences.length,
    overridden: series.merchantKey in overrides,
  };
}

export interface DetectRecurringResult {
  charges: RecurringCharge[];
  /** Transactions across the whole input whose direction could not be
   * derived — never fed to the detector, never silently dropped either. */
  undetermined: UndeterminedTransaction[];
}

/**
 * The recurring groups in a transaction history, classified. Wraps
 * subscription-detector.ts's `detectRecurringSeries` (unchanged) with the
 * direction derivation and classification this ticket adds.
 */
export function detectRecurring(
  transactions: BankTransactionLike[],
  overrides: ClassificationOverrides = {}
): DetectRecurringResult {
  const { detectorTxs, undetermined } = splitTransactions(transactions);
  const series = detectRecurringSeries(detectorTxs);
  return { charges: series.map((s) => toRecurringCharge(s, overrides)), undetermined };
}

// --- Burn -------------------------------------------------------------

function toCents(amount: number): number {
  return Math.round(amount * 100);
}

/**
 * The fixed/subscription/variable burn split for one calendar month, plus
 * the recurring charges that landed in it. Recurrence is detected over the
 * FULL transaction history handed in (a cadence needs more than one month of
 * data to prove), then only the target month's transactions are summed.
 *
 * Money in is tracked as a single total — the fixed/sub/variable split is
 * for spend only, per spec.md's problem statement ("what is my monthly
 * burn"), not for income.
 *
 * Sums run in integer cents throughout, converting back to euros only once
 * at the end, so fixed + sub + variable is guaranteed to equal `out` exactly
 * — float accumulation over dozens of transactions is exactly where a naive
 * euros-as-floats sum would drift by a cent.
 */
export function monthlyBurn(
  transactions: BankTransactionLike[],
  month: string,
  overrides: ClassificationOverrides = {}
): MonthlyBurnResult {
  const { detectorTxs, undetermined } = splitTransactions(transactions);
  const series = detectRecurringSeries(detectorTxs);
  const charges = series.map((s) => toRecurringCharge(s, overrides));
  // Recurring detection groups by direction + normalized merchant (see
  // subscription-detector.ts); rebuild the same composite key here so a
  // transaction can be matched back to the charge it belongs to.
  const chargeByKey = new Map(charges.map((c) => [`${c.direction}|${normalizeMerchantKey(c.label)}`, c]));

  let outCents = 0;
  let inCents = 0;
  let fixedCents = 0;
  let subCents = 0;
  let variableCents = 0;
  let txCount = 0;
  const chargeKeysSeenThisMonth = new Set<string>();

  for (const tx of detectorTxs) {
    if (!tx.date.startsWith(month)) continue;
    txCount++;
    const cents = toCents(tx.amount);
    if (tx.direction === "in") {
      inCents += cents;
      continue;
    }
    outCents += cents;
    const charge = chargeByKey.get(`out|${normalizeMerchantKey(tx.merchant)}`);
    if (charge) {
      chargeKeysSeenThisMonth.add(charge.merchantKey);
      if (charge.kind === "fixed") fixedCents += cents;
      else if (charge.kind === "sub") subCents += cents;
      else variableCents += cents;
    } else {
      variableCents += cents;
    }
  }

  const undeterminedThisMonth = undetermined.filter((u) => (u.bookingDate ?? "").startsWith(month));

  return {
    burn: {
      month,
      out: outCents / 100,
      in: inCents / 100,
      fixed: fixedCents / 100,
      sub: subCents / 100,
      variable: variableCents / 100,
      txCount,
    },
    recurring: charges.filter((c) => chargeKeysSeenThisMonth.has(c.merchantKey)),
    undetermined: undeterminedThisMonth,
  };
}

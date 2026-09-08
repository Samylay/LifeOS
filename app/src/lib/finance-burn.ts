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
import { keywordKind, monthlyAmount } from "./finance";
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
  out: number; // real spend this month — fixed + sub + variable, EXCLUDES transfer
  in: number; // real income this month — EXCLUDES transfer
  fixed: number; // recurring, hard to cancel
  sub: number; // recurring, cancellable
  variable: number; // everything else
  /** Money moved between Samy's own accounts (a transfer to another account
   * he holds) or into a Revolut internal pocket/round-up ("To Robo
   * portfolio") — real money movement, but neither spend nor income, so it
   * is never folded into `out`/`in`/`variable`. Tracked here instead of
   * being silently dropped. */
  transfer: number;
  txCount: number; // transactions counted into `out` + `in` this month (never transfers)
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

// --- Merchant fallback (CAUSE 1) -------------------------------------------
//
// Verified against the live data 2026-09-06: creditor_name/debtor_name is
// NULL on 53% of outgoing rows, and on 100% of Société Générale rows — every
// one of those collapsed into a single "UNKNOWN" merchant, which then failed
// subscription-detector.ts's amount-tolerance check (correctly — €0-9,000
// isn't one merchant). The counterparty is not missing, it is inside
// `remittance_information`, e.g.
//   "PRELEVEMENT EUROPEEN 3816317483 DE: NEXITY STUDEA ID: ... MOTIF: ..."
//   "VIR EUROPEEN EMIS ... POUR: M. SAMY LAYAIDA"
//   "COTISATION MENSUELLE SOBRIO"

function remittanceText(raw: unknown): string | null {
  if (raw && typeof raw === "object" && "remittance_information" in raw) {
    const value = (raw as { remittance_information?: unknown }).remittance_information;
    if (Array.isArray(value) && value.every((v) => typeof v === "string") && value.length > 0) {
      return (value as string[]).join(" ").trim() || null;
    }
  }
  return null;
}

/**
 * "DE: X" (SEPA direct debit, incoming-to-the-biller framing even though
 * money moves out of the account) and "POUR: X" (outgoing SEPA transfer
 * beneficiary) are this bank's two counterparty labels inside the free-text
 * remittance field. Falls back to the whole remittance text (a bank-fee line
 * like "COTISATION MENSUELLE SOBRIO" or a Revolut label like "To Robo
 * portfolio" carries the merchant as its only content) — normalizeMerchantKey
 * already strips reference numbers, so this doesn't need to be exact.
 */
export function deriveMerchantFromRemittance(raw: unknown): string | null {
  const text = remittanceText(raw);
  if (!text) return null;
  const labeled = text.match(/\bDE\s*:\s*(.+?)(?:\s+(?:ID|MOTIF|REF)\s*:|$)/i) ?? text.match(/\bPOUR\s*:\s*(.+?)(?:\s+(?:ID|MOTIF|REF)\s*:|$)/i);
  const captured = labeled?.[1]?.trim();
  return captured || text;
}

// --- Direct-debit signal (CAUSE 3: the fixed/sub split) --------------------
//
// "PRELEVEMENT" (SEPA direct debit) is the transaction-TYPE prefix a French
// bank puts on a collection a biller pulls from the account — rent managers,
// utilities, insurers, telecom operators, loan servicers, charities all bill
// this way. A discretionary media/software subscription (Netflix, Spotify,
// Claude, a SaaS tool) is charged by card instead, never a SEPA collection.
// This is deliberately read off the remittance text's own vocabulary, not a
// merchant name, so it generalises to any biller using the instrument,
// present or future, without a fixture ever naming one.
function isDirectDebit(raw: unknown): boolean {
  const text = remittanceText(raw);
  return text != null && /\bPRELEVEMENT\b/i.test(text);
}

// --- Self-transfer / internal-move detection (CAUSE 2) --------------------
//
// April's headline burn included €9,230 across two transfers to Samy's OWN
// accounts and €251 across 126 Revolut "To Robo portfolio" round-ups —
// neither is spend. Revolut's own product labels for an internal pocket move
// are generic ("To Robo portfolio", "To EUR", ...) and safe to match
// literally; a transfer to another account Samy holds is recognised by the
// caller-supplied `ownAccountIdentifiers` (an IBAN or the account holder's
// name, read at runtime from bank_accounts / config — never hardcoded here,
// since this module stays pure and this repo's remote is public).
const REVOLUT_INTERNAL_MOVE = /\b(to|from)\s+(robo portfolio|eur|usd|gbp|savings|vault|pocket)\b/i;

function isSelfTransfer(merchant: string, remittance: string | null, ownAccountIdentifiers: string[]): boolean {
  if (REVOLUT_INTERNAL_MOVE.test(merchant) || (remittance && REVOLUT_INTERNAL_MOVE.test(remittance))) return true;
  if (ownAccountIdentifiers.length === 0) return false;
  const haystack = `${merchant} ${remittance ?? ""}`.toUpperCase();
  return ownAccountIdentifiers.some((id) => id.trim() && haystack.includes(id.trim().toUpperCase()));
}

interface Converted {
  detectorTx: DetectorTransaction;
  /** True when this row is money moving between Samy's own accounts/pockets
   * rather than spend or income — routed to `BurnMonth.transfer` instead. */
  isTransfer: boolean;
  /** True when the raw payload's remittance text carries a SEPA direct-debit
   * marker. See `isDirectDebit` — feeds `classify`'s fixed/sub signal. */
  isDirectDebit: boolean;
}
interface NotConverted {
  undetermined: UndeterminedTransaction;
}

function convert(tx: BankTransactionLike, ownAccountIdentifiers: string[]): Converted | NotConverted {
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
  const namedMerchant = (direction === "out" ? tx.creditorName : tx.debtorName)?.trim();
  const remittance = remittanceText(tx.raw);
  const merchant = namedMerchant || deriveMerchantFromRemittance(tx.raw) || "UNKNOWN";
  return {
    detectorTx: {
      transactionId: tx.transactionId,
      merchant,
      amount: Math.abs(amount),
      direction,
      date: tx.bookingDate,
    },
    isTransfer: isSelfTransfer(merchant, remittance, ownAccountIdentifiers),
    isDirectDebit: isDirectDebit(tx.raw),
  };
}

/** Display uses the same direction and transfer rules as the spending totals. */
export function bankTransactionIdentity(tx: BankTransactionLike, ownAccountIdentifiers: string[] = []) {
  const direction = deriveDirection(tx.raw);
  const label = (direction === "out" ? tx.creditorName : tx.debtorName)?.trim()
    || deriveMerchantFromRemittance(tx.raw) || "Unknown merchant";
  const converted = convert(tx, ownAccountIdentifiers);
  return { label, direction, isTransfer: "isTransfer" in converted && converted.isTransfer,
    included: "detectorTx" in converted };
}

function splitTransactions(
  transactions: BankTransactionLike[],
  ownAccountIdentifiers: string[]
): {
  detectorTxs: DetectorTransaction[];
  /** Self-transfers/internal moves — summed into `BurnMonth.transfer` only,
   * never fed to the recurring-charge detector and never counted as spend
   * or income. */
  transferTxs: DetectorTransaction[];
  undetermined: UndeterminedTransaction[];
  /** transactionId -> was this a SEPA direct debit, for every row in
   * `detectorTxs`. Kept as a side map rather than a field on
   * `DetectorTransaction` because subscription-detector.ts's shape is
   * shared/tested elsewhere and stays untouched — see `classify`. */
  directDebitByTxId: Map<string, boolean>;
} {
  const detectorTxs: DetectorTransaction[] = [];
  const transferTxs: DetectorTransaction[] = [];
  const undetermined: UndeterminedTransaction[] = [];
  const directDebitByTxId = new Map<string, boolean>();
  for (const tx of transactions) {
    const result = convert(tx, ownAccountIdentifiers);
    if ("detectorTx" in result) {
      if (result.isTransfer) transferTxs.push(result.detectorTx);
      else {
        detectorTxs.push(result.detectorTx);
        directDebitByTxId.set(result.detectorTx.transactionId, result.isDirectDebit);
      }
    } else {
      undetermined.push(result.undetermined);
    }
  }
  return { detectorTxs, transferTxs, undetermined, directDebitByTxId };
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

// A real discretionary subscription in this data tops out well under this —
// Netflix/Spotify/a gym/a SaaS seat are all two-digit euros a month. A
// recurring charge this large, with no keyword match and no direct-debit
// marker either, reads as an unrecognised bill far more often than a
// subscription he forgot to name, so it defaults to "fixed" rather than
// "sub" — the same asymmetry `inferKind`'s own fallback already applies in
// the opposite direction for genuinely ambiguous small charges.
const FIXED_AMOUNT_FLOOR = 150;

/**
 * Overrides win over every guess below. Kept as its own function because
 * ticket 01 names it explicitly: "classify(group)".
 *
 * `inferKind`'s label-keyword match still wins when it fires (Netflix, rent,
 * insurance...). What it CAN'T see from a label alone is the instrument a
 * charge was collected with or how it compares to his other recurring
 * charges — so for everything a keyword doesn't already resolve, this reads
 * two signals `inferKind` has no access to:
 *   1. SEPA direct debit ("PRELEVEMENT..." — see `isDirectDebit`) is how
 *      billers (rent managers, utilities, insurers, telecoms, banks,
 *      charities) collect a recurring cost of living; a discretionary media
 *      or software subscription is charged by card instead. Majority of a
 *      series' occurrences being direct debits reads as "fixed".
 *   2. Amount magnitude: nothing in the "cancel it and lose only
 *      convenience" bucket costs hundreds of euros a month — a large,
 *      unmatched, non-direct-debit recurring charge reads as "fixed" too.
 * Neither signal names a merchant, so this holds up when Samy changes bank,
 * landlord or phone plan.
 */
export function classify(
  series: RecurringSeries,
  overrides: ClassificationOverrides = {},
  directDebitByTxId: ReadonlyMap<string, boolean> = new Map()
): FlowKind {
  const override = overrides[series.merchantKey];
  if (override) return override;
  if (series.direction === "in") return "fixed";

  const keyword = keywordKind(series.merchantRaw);
  if (keyword) return keyword;

  const directDebitCount = series.occurrences.filter((o) => directDebitByTxId.get(o.transactionId)).length;
  if (directDebitCount / series.occurrences.length >= 0.5) return "fixed";

  if (monthlyAmount({ amount: series.amount, cadence: series.cadence }) >= FIXED_AMOUNT_FLOOR) return "fixed";

  // Cheap, card-charged, unmatched and recurring: still more often a
  // subscription he hasn't named than a bill, same asymmetry as before.
  return "sub";
}

function toRecurringCharge(
  series: RecurringSeries,
  overrides: ClassificationOverrides,
  directDebitByTxId: ReadonlyMap<string, boolean>
): RecurringCharge {
  return {
    merchantKey: series.merchantKey,
    label: series.merchantRaw,
    direction: series.direction,
    cadence: series.cadence,
    amount: series.amount,
    kind: classify(series, overrides, directDebitByTxId),
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
  overrides: ClassificationOverrides = {},
  /** Own-account identifiers (IBAN, holder name) so a self-transfer never
   * gets mistaken for a recurring charge. See `monthlyBurn`'s doc comment. */
  ownAccountIdentifiers: string[] = []
): DetectRecurringResult {
  const { detectorTxs, undetermined, directDebitByTxId } = splitTransactions(transactions, ownAccountIdentifiers);
  const series = detectRecurringSeries(detectorTxs);
  return { charges: series.map((s) => toRecurringCharge(s, overrides, directDebitByTxId)), undetermined };
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
 * euros-as-floats sum would drift by a cent. `transfer` is summed
 * separately and is never part of that invariant, nor of `in`: it is real
 * money movement (a transfer to another of Samy's own accounts, a Revolut
 * round-up into a pocket) but neither spend nor income (CAUSE 2).
 */
export function monthlyBurn(
  transactions: BankTransactionLike[],
  month: string,
  overrides: ClassificationOverrides = {},
  /** Own-account identifiers (IBAN, holder name) read at runtime from
   * bank_accounts / config by the caller — this module stays pure, so it
   * never queries the DB itself. Empty by default: only Revolut's own
   * internal-move labels are recognised with no identifiers supplied. */
  ownAccountIdentifiers: string[] = []
): MonthlyBurnResult {
  const { detectorTxs, transferTxs, undetermined, directDebitByTxId } = splitTransactions(
    transactions,
    ownAccountIdentifiers
  );
  const series = detectRecurringSeries(detectorTxs);
  const charges = series.map((s) => toRecurringCharge(s, overrides, directDebitByTxId));
  // Recurring detection groups by direction + normalized merchant (see
  // subscription-detector.ts); rebuild the same composite key here so a
  // transaction can be matched back to the charge it belongs to.
  const chargeByKey = new Map(charges.map((c) => [`${c.direction}|${normalizeMerchantKey(c.label)}`, c]));

  let outCents = 0;
  let inCents = 0;
  let fixedCents = 0;
  let subCents = 0;
  let variableCents = 0;
  let transferCents = 0;
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

  for (const tx of transferTxs) {
    if (!tx.date.startsWith(month)) continue;
    transferCents += toCents(tx.amount);
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
      transfer: transferCents / 100,
      txCount,
    },
    recurring: charges.filter((c) => chargeKeysSeenThisMonth.has(c.merchantKey)),
    undetermined: undeterminedThisMonth,
  };
}

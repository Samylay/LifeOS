// Server-side read for /finance's "burn on open" surface (finance-rework
// ticket 02). This is the glue layer: it reads bank-db (I/O), then hands the
// rows to finance-burn.ts's pure `monthlyBurn` — the module itself stays
// untouched, per the ticket's "USE IT; do not reimplement" instruction.
import {
  listBankTransactionsInRange,
  listConnectedAccounts,
  listBankSessions,
  getBankSyncState,
  type ConnectedAccountRow,
  type BankTransactionForBurn,
} from "./bank-db";
import { detectRecurring, monthlyBurn, type MonthlyBurnResult, type BankTransactionLike, type RecurringCharge } from "./finance-burn";
import { recentMonths } from "./finance-months";
import { isSyncStale, formatLastSynced } from "./finance-freshness";
import { findExpiringConsents } from "./bank-consent-tripwire";
import { yearlyAmount } from "./finance";

/** How many months of burn history the surface shows — the spec's "six
 * months of history are already there... useful the moment it opens". */
const HISTORY_MONTHS = 6;

export interface ConsentWarning {
  sessionId: string;
  aspspName: string | null;
  /** May be negative — the consent already lapsed. */
  daysRemaining: number;
}

// --- Ticket 03: recurring charges visible ----------------------------------
//
// "New" is a fact about the data (spec.md), not a status anyone maintains: a
// charge is new when its FIRST occurrence falls inside the month currently on
// screen. Next month that's no longer true on its own — nothing to dismiss,
// nothing that piles up. Kept here (glue layer) rather than in finance-burn.ts
// because "the period on screen" is a presentation concept this surface
// defines (the current month of the burn-history window), not something the
// pure recurrence detector should know about.

export interface RecurringChargeView extends RecurringCharge {
  /** True when `firstSeen` falls in `currentMonth` — see module note above. */
  isNew: boolean;
}

/** Exported for finance-overview.test.ts; also usable by any future caller
 * that needs the same "is this newly appeared" rule against a month it names
 * itself, rather than always "now". */
export function markNewlyAppeared(charges: RecurringCharge[], currentMonth: string): RecurringChargeView[] {
  return charges.map((c) => ({ ...c, isNew: c.firstSeen.startsWith(currentMonth) }));
}

export interface CancellableGroup {
  /** Cancellable ("sub") charges, dearest first — spec.md's "what could I
   * stop paying for" ordering. */
  charges: RecurringChargeView[];
  /** Sum of every charge's yearly cost, stated because a monthly figure
   * understates what a subscription actually costs (spec.md). */
  yearlyTotal: number;
}

/** Reuses finance.ts's `yearlyAmount` (same amount+cadence shape a
 * `RecurringCharge` already has) rather than re-deriving a monthly-to-yearly
 * conversion here. */
export function groupCancellable(charges: RecurringChargeView[]): CancellableGroup {
  const subs = charges.filter((c) => c.kind === "sub");
  const sorted = [...subs].sort((a, b) => yearlyAmount(b) - yearlyAmount(a));
  const yearlyTotal = sorted.reduce((sum, c) => sum + yearlyAmount(c), 0);
  return { charges: sorted, yearlyTotal };
}

export interface FinanceOverview {
  /** Oldest first, HISTORY_MONTHS entries, the last one being `now`'s month. */
  months: MonthlyBurnResult[];
  accounts: ConnectedAccountRow[];
  /** Epoch ms, or null if a sync has never run. */
  lastSyncAt: number | null;
  /** "Synced 5 days ago" / "Never synced" — ready to render as-is. */
  lastSyncedLabel: string;
  stale: boolean;
  consentWarnings: ConsentWarning[];
  /** Every recurring charge detected over the same transaction window the
   * burn split reads (ticket 03) — same detector, same classify(), so this
   * list and `months[*].burn.fixed`/`.sub` are always the same underlying
   * classification, never a parallel computation. */
  recurringCharges: RecurringChargeView[];
  /** The cancellable ("sub") subset of `recurringCharges`, grouped and
   * totalled — spec.md story 7. */
  cancellable: CancellableGroup;
}

function toBankTransactionLike(row: BankTransactionForBurn): BankTransactionLike {
  return {
    transactionId: row.transactionId,
    bookingDate: row.bookingDate,
    amount: row.amount,
    creditorName: row.creditorName,
    debtorName: row.debtorName,
    raw: row.raw,
  };
}

/**
 * Everything the /finance burn-on-open surface reads, in one call. `now` is
 * injectable so tests never depend on the real clock (same pattern as
 * bank-consent-tripwire.ts's `now` parameter).
 */
export function getFinanceOverview(now: Date = new Date()): FinanceOverview {
  const months = recentMonths(now, HISTORY_MONTHS);
  const fromMonth = `${months[0]}-01`;
  // Exclusive upper bound one day past `now`, so today's own transactions —
  // booking_date === today — are still included by the `< toMonth` range
  // query in bank-db.ts.
  const toExclusive = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))
    .toISOString()
    .slice(0, 10);

  const transactions = listBankTransactionsInRange(fromMonth, toExclusive).map(toBankTransactionLike);
  const burnMonths = months.map((month) => monthlyBurn(transactions, month));

  // Corrections (ticket 04) aren't wired up yet — {} is the "no overrides"
  // default `classify` already accepts, so this list agrees with
  // `burnMonths`' classification today and needs no change when ticket 04
  // lands an override store; only this `{}` becomes a real lookup.
  const currentMonth = months[months.length - 1];
  const recurringCharges = markNewlyAppeared(detectRecurring(transactions, {}).charges, currentMonth);
  const cancellable = groupCancellable(recurringCharges);

  const lastSyncAtRaw = getBankSyncState("last_sync_at");
  const lastSyncAt = lastSyncAtRaw !== null && lastSyncAtRaw !== "" ? Number(lastSyncAtRaw) : null;
  const nowMs = now.getTime();

  const consentWarnings = findExpiringConsents(listBankSessions(), now.toISOString()).map((entry) => ({
    sessionId: entry.session.sessionId,
    aspspName: entry.session.aspspName,
    daysRemaining: entry.daysRemaining,
  }));

  return {
    months: burnMonths,
    accounts: listConnectedAccounts(),
    lastSyncAt,
    lastSyncedLabel: formatLastSynced(lastSyncAt, nowMs),
    stale: isSyncStale(lastSyncAt, nowMs),
    consentWarnings,
    recurringCharges,
    cancellable,
  };
}

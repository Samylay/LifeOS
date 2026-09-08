// Server-side read for /finance's "burn on open" surface (finance-rework
// ticket 02). This is the glue layer: it reads bank-db (I/O), then hands the
// rows to finance-burn.ts's pure `monthlyBurn` — the module itself stays
// untouched, per the ticket's "USE IT; do not reimplement" instruction.
import {
  listBankTransactionsInRange,
  listConnectedAccounts,
  listBankSessions,
  getBankSyncState,
  listOwnAccountIdentifiers,
  type ConnectedAccountRow,
  type BankTransactionForBurn,
} from "./bank-db";
import { detectRecurring, monthlyBurn, type MonthlyBurnResult, type BankTransactionLike, type RecurringCharge } from "./finance-burn";
import { recentMonths } from "./finance-months";
import { isSyncStale, formatLastSynced } from "./finance-freshness";
import { findExpiringConsents } from "./bank-consent-tripwire";
import { yearlyAmount } from "./finance";
import { listClassificationOverrides } from "./finance-overrides-db";
import { financeActivity, type FinanceActivity } from "./finance-activity";
import { listMerchantLabels } from "./finance-labels-db";
import { nextBankSyncAt } from "./bank-sync-schedule";
import { isEnableBankingConfigured } from "./enable-banking";

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
  activity: FinanceActivity[];
  configured: boolean;
  nextSyncAt: number | null;
  syncError: string | null;
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

  const rows = listBankTransactionsInRange(fromMonth, toExclusive);
  // No exchange rate is available. Never add different currencies as euros.
  const transactions = rows.filter((row) => row.currency === "EUR").map(toBankTransactionLike);
  // Own-account identifiers (IBAN, account nickname) plus, when set, the
  // account holder's own name — kept out of source (public remote) and read
  // from a gitignored .env instead, same as any other repo-local secret.
  const ownAccountIdentifiers = [
    ...listOwnAccountIdentifiers(),
    ...(process.env.FINANCE_ACCOUNT_HOLDER_NAME ? [process.env.FINANCE_ACCOUNT_HOLDER_NAME] : []),
  ];
  // Ticket 04: corrections, keyed by normalized counterparty, read fresh on
  // every call — the same store `monthlyBurn` and `detectRecurring` are both
  // handed below, so a burn month's fixed/sub/variable split and the
  // recurring-charges list are always the same underlying classification,
  // never a parallel computation.
  const overrides = listClassificationOverrides();
  const burnMonths = months.map((month) => monthlyBurn(transactions, month, overrides, ownAccountIdentifiers));

  const currentMonth = months[months.length - 1];
  const recurringCharges = markNewlyAppeared(detectRecurring(transactions, overrides).charges, currentMonth);
  const cancellable = groupCancellable(recurringCharges);

  const lastSyncAtRaw = getBankSyncState("last_sync_at");
  const lastSyncAt = lastSyncAtRaw !== null && lastSyncAtRaw !== "" ? Number(lastSyncAtRaw) : null;
  const nowMs = now.getTime();
  const accounts = listConnectedAccounts();
  const configured = isEnableBankingConfigured();

  const consentWarnings = findExpiringConsents(listBankSessions(), now.toISOString()).map((entry) => ({
    sessionId: entry.session.sessionId,
    aspspName: entry.session.aspspName,
    daysRemaining: entry.daysRemaining,
  }));

  return {
    activity: financeActivity(rows, ownAccountIdentifiers, listMerchantLabels()),
    configured,
    nextSyncAt: configured && accounts.length ? nextBankSyncAt(Number(getBankSyncState("last_sync_attempt_at")), lastSyncAt, nowMs) : null,
    syncError: getBankSyncState("last_sync_error") || getBankSyncState("last_balance_error") || null,
    months: burnMonths,
    accounts,
    lastSyncAt,
    lastSyncedLabel: formatLastSynced(lastSyncAt, nowMs),
    stale: isSyncStale(lastSyncAt, nowMs),
    consentWarnings,
    recurringCharges,
    cancellable,
  };
}

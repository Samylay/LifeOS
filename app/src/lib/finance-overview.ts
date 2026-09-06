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
import { monthlyBurn, type MonthlyBurnResult, type BankTransactionLike } from "./finance-burn";
import { recentMonths } from "./finance-months";
import { isSyncStale, formatLastSynced } from "./finance-freshness";
import { findExpiringConsents } from "./bank-consent-tripwire";

/** How many months of burn history the surface shows — the spec's "six
 * months of history are already there... useful the moment it opens". */
const HISTORY_MONTHS = 6;

export interface ConsentWarning {
  sessionId: string;
  aspspName: string | null;
  /** May be negative — the consent already lapsed. */
  daysRemaining: number;
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
  };
}

// Pulls transactions from Enable Banking into the local SQLite store (T69).
// Shared by manual refresh and the five-hour scheduler.
import { isEnableBankingConfigured, getTransactions, getBalances, type EnableBankingTransport } from "./enable-banking";
import {
  listBankAccounts,
  listBankSessions,
  upsertBankTransactions,
  countBankTransactions,
  setBankSyncState,
  saveAccountBalance,
} from "./bank-db";
import { checkAndNotifyConsentExpiry } from "./bank-consent-notify";

const MAX_PAGES_PER_ACCOUNT = 20;

export interface AccountSyncResult {
  accountUid: string;
  fetched: number;
  inserted: number;
  error?: string;
}

export interface BankSyncResult {
  ok: boolean;
  accounts: AccountSyncResult[];
  totalInserted: number;
  total: number;
  reason?: string;
}

/**
 * Syncs every linked account's transactions. Idempotent: transactions are
 * deduped on the aggregator's transaction id (see bank-db.upsertBankTransactions),
 * so re-running over already-seen history inserts 0 rows and mutates nothing.
 */
export async function syncBankTransactions(
  transport: EnableBankingTransport = fetch
): Promise<BankSyncResult> {
  if (!isEnableBankingConfigured()) {
    return { ok: false, accounts: [], totalInserted: 0, total: countBankTransactions(), reason: "not configured" };
  }

  const accounts = listBankAccounts();
  if (accounts.length === 0) {
    return { ok: false, accounts: [], totalInserted: 0, total: countBankTransactions(), reason: "no linked accounts" };
  }

  const results: AccountSyncResult[] = [];
  let totalInserted = 0;
  let balanceFailures = 0;
  setBankSyncState("last_sync_attempt_at", String(Date.now()));

  for (const account of accounts) {
    let fetched = 0;
    let inserted = 0;
    let continuationKey: string | undefined;
    let page = 0;
    let error: string | undefined;
    try {
      do {
        const page_ = await getTransactions(account.accountUid, continuationKey, transport);
        if (!page_) { error = "Transactions could not be refreshed. Check bank consent."; break; }
        fetched += page_.transactions.length;
        inserted += upsertBankTransactions(
          page_.transactions.map((t) => ({ ...t, accountUid: account.accountUid }))
        );
        continuationKey = page_.continuationKey;
        page++;
      } while (continuationKey && page < MAX_PAGES_PER_ACCOUNT);
      if (continuationKey && page >= MAX_PAGES_PER_ACCOUNT) error = "Bank history exceeded the page limit. Sync is incomplete.";
    } catch {
      error = "Transactions could not be refreshed. Check bank consent.";
    }
    try {
      // Balance is a separate endpoint (T71) and best-effort too — a balance
      // fetch failing should never roll back transactions already inserted.
      const balances = await getBalances(account.accountUid, transport);
      if (balances === null) balanceFailures++;
      const primary = balances?.[0];
      if (primary) saveAccountBalance(account.accountUid, primary.balanceAmount, primary.balanceCurrency);
    } catch {
      balanceFailures++;
    }
    results.push({ accountUid: account.accountUid, fetched, inserted, ...(error ? { error } : {}) });
    totalInserted += inserted;
  }

  const failed = results.filter((result) => result.error).length;
  const reason = failed ? `${failed} of ${accounts.length} accounts could not fully sync. Check bank consent and retry.` : undefined;
  if (!failed) setBankSyncState("last_sync_at", String(Date.now()));
  setBankSyncState("last_sync_error", reason ?? "");
  setBankSyncState("last_balance_error", balanceFailures ? `${balanceFailures} account balances could not refresh. Balance dates show the last available update.` : "");

  // Consent-expiry tripwire (T72), deduplicated by session and day. Best-effort:
  // a pager failure must never mark the sync itself as failed.
  try {
    await checkAndNotifyConsentExpiry(listBankSessions(), transport);
  } catch {
    // See doc comment — never let this fail the sync.
  }

  return { ok: failed === 0, accounts: results, totalInserted, total: countBankTransactions(), ...(reason ? { reason } : {}) };
}

declare global { var __bankSyncFlight: Promise<BankSyncResult> | undefined; }

/** One bank refresh at a time, including requests arriving in another route bundle. */
export function requestBankSync(): Promise<BankSyncResult> {
  if (globalThis.__bankSyncFlight) return globalThis.__bankSyncFlight;
  const flight = syncBankTransactions().finally(() => { globalThis.__bankSyncFlight = undefined; });
  globalThis.__bankSyncFlight = flight;
  return flight;
}

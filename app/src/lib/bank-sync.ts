// Pulls transactions from Enable Banking into the local SQLite store (T69).
// Manual-trigger only (an API route) — no scheduler yet, per the roadmap:
// the shape needs to prove itself against Samy's real accounts first.
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

  for (const account of accounts) {
    let fetched = 0;
    let inserted = 0;
    let continuationKey: string | undefined;
    let page = 0;
    try {
      do {
        const page_ = await getTransactions(account.accountUid, continuationKey, transport);
        if (!page_) break;
        fetched += page_.transactions.length;
        inserted += upsertBankTransactions(
          page_.transactions.map((t) => ({ ...t, accountUid: account.accountUid }))
        );
        continuationKey = page_.continuationKey;
        page++;
      } while (continuationKey && page < MAX_PAGES_PER_ACCOUNT);
    } catch {
      // Best-effort per account — one account's failure shouldn't drop the rest.
    }
    try {
      // Balance is a separate endpoint (T71) and best-effort too — a balance
      // fetch failing should never roll back transactions already inserted.
      const balances = await getBalances(account.accountUid, transport);
      const primary = balances?.[0];
      if (primary) saveAccountBalance(account.accountUid, primary.balanceAmount, primary.balanceCurrency);
    } catch {
      // Balance is a nice-to-have on the connected-accounts panel, not load-bearing.
    }
    results.push({ accountUid: account.accountUid, fetched, inserted });
    totalInserted += inserted;
  }

  setBankSyncState("last_sync_at", String(Date.now()));

  // Consent-expiry tripwire (T72) — wired into the manual sync rather than a
  // scheduler, per T69's deliberate manual-trigger-only scope. Best-effort:
  // a pager failure must never mark the sync itself as failed.
  try {
    await checkAndNotifyConsentExpiry(listBankSessions(), transport);
  } catch {
    // See doc comment — never let this fail the sync.
  }

  return { ok: true, accounts: results, totalInserted, total: countBankTransactions() };
}

// Pulls transactions from Enable Banking into the local SQLite store (T69).
// Manual-trigger only (an API route) — no scheduler yet, per the roadmap:
// the shape needs to prove itself against Samy's real accounts first.
import { isEnableBankingConfigured, getTransactions, type EnableBankingTransport } from "./enable-banking";
import { listBankAccounts, upsertBankTransactions, countBankTransactions, setBankSyncState } from "./bank-db";

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
    results.push({ accountUid: account.accountUid, fetched, inserted });
    totalInserted += inserted;
  }

  setBankSyncState("last_sync_at", String(Date.now()));
  return { ok: true, accounts: results, totalInserted, total: countBankTransactions() };
}

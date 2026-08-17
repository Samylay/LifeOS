"use client";

// Client hook for the /finance connected-accounts panel (T71). Read-only:
// fetches the bank-fed side (accounts + balances + recent synced
// transactions) on mount, distinct from useFinance's hand-kept flows. See
// bank-db.listConnectedAccounts/listRecentBankTransactions for the shape.
import { useCallback, useEffect, useState } from "react";

export interface ConnectedAccount {
  accountUid: string;
  sessionId: string;
  aspspName: string | null;
  aspspCountry: string | null;
  validUntil: string | null;
  balanceAmount: string | null;
  balanceCurrency: string | null;
  balanceSyncedAt: string | null;
}

export interface RecentBankTransaction {
  transactionId: string;
  accountUid: string;
  bookingDate: string | null;
  amount: string;
  currency: string;
  creditorName: string | null;
  debtorName: string | null;
}

export function useBankAccounts() {
  const [configured, setConfigured] = useState(false);
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  const [recentTransactions, setRecentTransactions] = useState<RecentBankTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/finance/accounts");
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = await res.json();
      setConfigured(Boolean(data.configured));
      setAccounts(data.accounts ?? []);
      setRecentTransactions(data.recentTransactions ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load connected accounts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await refresh();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { configured, accounts, recentTransactions, loading, error, refresh };
}

"use client";

// Client hook for the /finance burn-on-open surface (ticket 02). Mirrors
// use-bank-accounts.ts's shape (read-only, fetch-on-mount) but reads
// GET /api/finance/burn, the new derived-burn read.
import { useEffect, useState } from "react";
import type { MonthlyBurnResult } from "./finance-burn";
import type { ConnectedAccountRow } from "./bank-db";
import type { ConsentWarning } from "./finance-overview";

export interface FinanceBurnOverview {
  months: MonthlyBurnResult[];
  accounts: ConnectedAccountRow[];
  lastSyncAt: number | null;
  lastSyncedLabel: string;
  stale: boolean;
  consentWarnings: ConsentWarning[];
}

export function useFinanceBurn() {
  const [overview, setOverview] = useState<FinanceBurnOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/finance/burn");
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data = (await res.json()) as FinanceBurnOverview;
        if (!cancelled) setOverview(data);
      } catch (err: unknown) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load burn");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { overview, loading, error };
}

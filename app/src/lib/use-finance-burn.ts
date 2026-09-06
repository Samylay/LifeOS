"use client";

// Client hook for the /finance burn-on-open surface (ticket 02). Mirrors
// use-bank-accounts.ts's shape (read-only, fetch-on-mount) but reads
// GET /api/finance/burn, the new derived-burn read.
import { useCallback, useEffect, useState } from "react";
import type { MonthlyBurnResult } from "./finance-burn";
import type { ConnectedAccountRow } from "./bank-db";
import type { CancellableGroup, ConsentWarning, RecurringChargeView } from "./finance-overview";
import type { FlowKind } from "./finance";

export interface FinanceBurnOverview {
  months: MonthlyBurnResult[];
  accounts: ConnectedAccountRow[];
  lastSyncAt: number | null;
  lastSyncedLabel: string;
  stale: boolean;
  consentWarnings: ConsentWarning[];
  /** Every detected recurring charge (ticket 03) — same source as the burn
   * split above, never a parallel computation. */
  recurringCharges: RecurringChargeView[];
  cancellable: CancellableGroup;
}

export function useFinanceBurn() {
  const [overview, setOverview] = useState<FinanceBurnOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/finance/burn");
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = (await res.json()) as FinanceBurnOverview;
      setOverview(data);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load burn");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Ticket 04: the one mutation this surface has. Both correct a
  // classification and clear it re-fetch the whole overview afterwards —
  // one gesture, and the fixed/sub/variable buckets it moves are recomputed
  // server-side rather than guessed at client-side.
  const correctCharge = useCallback(
    async (merchantKey: string, kind: FlowKind) => {
      const res = await fetch("/api/finance/overrides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ merchantKey, kind }),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      await load();
    },
    [load]
  );

  const clearCorrection = useCallback(
    async (merchantKey: string) => {
      const res = await fetch("/api/finance/overrides", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ merchantKey }),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      await load();
    },
    [load]
  );

  return { overview, loading, error, correctCharge, clearCorrection };
}

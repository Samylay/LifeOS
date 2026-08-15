"use client";

import { useCallback, useMemo } from "react";
import { useCollection } from "./use-collection";
import {
  computeTotals,
  habitLines,
  spendByKind,
  subscriptions,
  type FinanceFlow,
  type FinanceFlowDraft,
} from "./finance";

export function useFinance() {
  const { items: flows, loading, create, update, remove } = useCollection<FinanceFlow>("financeFlows", {
    orderByField: "createdAt",
    orderDir: "asc",
    fallbackDates: ["createdAt"],
  });

  const addFlow = useCallback(
    async (draft: FinanceFlowDraft) => create({ ...draft, createdAt: new Date() } as Omit<FinanceFlow, "id">),
    [create]
  );

  /** Bulk path for the paste box — sequential so the local-db write
   * invalidation fires once per row and the list fills in visibly. */
  const addFlows = useCallback(
    async (drafts: FinanceFlowDraft[]) => {
      for (const draft of drafts) {
        await create({ ...draft, createdAt: new Date() } as Omit<FinanceFlow, "id">);
      }
    },
    [create]
  );

  const updateFlow = useCallback(
    async (id: string, patch: Partial<FinanceFlow>) => update(id, { ...patch, updatedAt: new Date() }),
    [update]
  );

  const deleteFlow = useCallback(async (id: string) => remove(id), [remove]);

  const derived = useMemo(
    () => ({
      totals: computeTotals(flows),
      subs: subscriptions(flows),
      spend: spendByKind(flows),
      habits: habitLines(flows),
      income: flows.filter((f) => f.direction === "in"),
      outgoings: flows.filter((f) => f.direction === "out"),
    }),
    [flows]
  );

  return { flows, loading, addFlow, addFlows, updateFlow, deleteFlow, ...derived };
}

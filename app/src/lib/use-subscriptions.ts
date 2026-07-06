"use client";

import { useCallback } from "react";
import { useCollection } from "./use-collection";
import type { Subscription } from "./types";

export function useSubscriptions() {
  const { items: subscriptions, loading, create, update, remove } =
    useCollection<Subscription>("finance/data/subscriptions", {
      orderByField: "renewalDate",
      orderDir: "asc",
      fallbackDates: ["renewalDate"],
    });

  const createSubscription = useCallback(
    async (data: Omit<Subscription, "id">) => {
      return await create(data);
    },
    [create]
  );

  const updateSubscription = useCallback(
    async (id: string, data: Partial<Subscription>) => {
      await update(id, data);
    },
    [update]
  );

  const deleteSubscription = useCallback(
    async (id: string) => remove(id),
    [remove]
  );

  const totalMonthlyCost = subscriptions.reduce((sum, sub) => {
    return sum + (sub.frequency === "yearly" ? sub.cost / 12 : sub.cost);
  }, 0);

  return { subscriptions, loading, createSubscription, updateSubscription, deleteSubscription, totalMonthlyCost };
}

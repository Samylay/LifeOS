"use client";

import { useCallback } from "react";
import { useCollection } from "./use-collection";
import type { LearnItem } from "./types";

export function useLearnItems() {
  const { items, loading, create, update, remove } = useCollection<LearnItem>(
    "learnItems",
    { orderByField: "createdAt", orderDir: "desc" }
  );

  const createItem = useCallback(
    async (data: Omit<LearnItem, "id" | "createdAt" | "updatedAt">) => {
      const now = new Date();
      return await create({ ...data, createdAt: now, updatedAt: now });
    },
    [create]
  );

  const updateItem = useCallback(
    async (id: string, data: Partial<LearnItem>) => {
      await update(id, { ...data, updatedAt: new Date() });
    },
    [update]
  );

  const deleteItem = useCallback(async (id: string) => remove(id), [remove]);

  return { items, loading, createItem, updateItem, deleteItem };
}

"use client";

import { useCallback } from "react";
import { useCollection } from "./use-collection";
import type { ShipLogEntry } from "./types";

export function useShipLog() {
  const { items: entries, loading, create, update, remove } = useCollection<ShipLogEntry>(
    "shipLog",
    { orderByField: "date", orderDir: "desc", fallbackDates: ["createdAt", "date"] }
  );

  const logShip = useCallback(
    async (data: Omit<ShipLogEntry, "id" | "createdAt">) => {
      return await create({ ...data, createdAt: new Date() });
    },
    [create]
  );

  const updateEntry = useCallback(
    async (id: string, data: Partial<ShipLogEntry>) => update(id, data),
    [update]
  );

  const deleteEntry = useCallback(async (id: string) => remove(id), [remove]);

  return { entries, loading, logShip, updateEntry, deleteEntry };
}

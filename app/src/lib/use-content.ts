"use client";

import { useCallback, useEffect, useRef } from "react";
import { useCollection } from "./use-collection";
import type { ContentIdea } from "./types";
import { SEED_IDEAS } from "./content-os";
import { migrateStatus, needsStatusMigration } from "./content/idea-status";

export function useContentIdeas() {
  const { items: ideas, loading, create, update, remove } =
    useCollection<ContentIdea>("contentIdeas", {
      orderByField: "createdAt",
      orderDir: "asc",
    });

  // Self-healing status migration (T-content-rework-02), the same pattern the
  // goals migration uses: the live app rewrites legacy rows on first load
  // through the normal update path, rather than an agent reaching into the
  // database. Runs once per session and only for rows that need it.
  const migrated = useRef(false);
  useEffect(() => {
    if (loading || migrated.current) return;
    const stale = ideas.filter(needsStatusMigration);
    if (stale.length === 0) {
      migrated.current = true;
      return;
    }
    migrated.current = true;
    void Promise.all(
      stale.map((i) => update(i.id, { status: migrateStatus(i.status as string) })),
    ).catch(() => {
      // A failed migration must not wedge the bank: the rows are still there
      // and the next load tries again.
      migrated.current = false;
    });
  }, [ideas, loading, update]);

  const createIdea = useCallback(
    async (data: Omit<ContentIdea, "id" | "createdAt" | "updatedAt">) => {
      const now = new Date();
      return await create({ ...data, createdAt: now, updatedAt: now });
    },
    [create]
  );

  const updateIdea = useCallback(
    async (id: string, data: Partial<ContentIdea>) => {
      await update(id, { ...data, updatedAt: new Date() });
    },
    [update]
  );

  const deleteIdea = useCallback(async (id: string) => remove(id), [remove]);

  // One-shot import of the 60 starter ideas from the vault's idea bank.
  const seedIdeas = useCallback(async () => {
    const now = new Date();
    for (const [i, seed] of SEED_IDEAS.entries()) {
      // Stagger createdAt so orderBy(createdAt) preserves vault order.
      const at = new Date(now.getTime() + i);
      await create({ ...seed, status: "idea", createdAt: at, updatedAt: at });
    }
  }, [create]);

  return { ideas, loading, createIdea, updateIdea, deleteIdea, seedIdeas };
}

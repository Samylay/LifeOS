"use client";

import { useCallback } from "react";
import { useCollection } from "./use-collection";
import type { ContentIdea, ContentPost } from "./types";
import { SEED_IDEAS } from "./content-os";

export function useContentIdeas() {
  const { items: ideas, loading, create, update, remove } =
    useCollection<ContentIdea>("contentIdeas", {
      orderByField: "createdAt",
      orderDir: "asc",
    });

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

export function useContentPosts() {
  const { items: posts, loading, create, update, remove } =
    useCollection<ContentPost>("contentPosts", {
      orderByField: "date",
      orderDir: "desc",
    });

  const createPost = useCallback(
    async (data: Omit<ContentPost, "id" | "createdAt" | "updatedAt">) => {
      const now = new Date();
      return await create({ ...data, createdAt: now, updatedAt: now });
    },
    [create]
  );

  const updatePost = useCallback(
    async (id: string, data: Partial<ContentPost>) => {
      await update(id, { ...data, updatedAt: new Date() });
    },
    [update]
  );

  const deletePost = useCallback(async (id: string) => remove(id), [remove]);

  return { posts, loading, createPost, updatePost, deletePost };
}

"use client";

import { useCallback } from "react";
import { useCollection } from "./use-collection";
import type { ContentIdea, ContentPost } from "./types";
import { SEED_IDEAS } from "./content-os";
import { planWeeklyBatch, type BatchPlan, type ScriptDraft } from "./content-scripting";

async function fetchScriptDraft(idea: ContentIdea): Promise<ScriptDraft> {
  const res = await fetch("/api/content/script", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: idea.title,
      pillar: idea.pillar,
      hookFormula: idea.hookFormula,
      episode: idea.episode,
      notes: idea.notes,
    }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "script draft failed");
  }
  const { draft } = await res.json();
  return draft as ScriptDraft;
}

export interface BatchResult extends BatchPlan {
  scripted: ContentIdea[];
  failed: { idea: ContentIdea; error: string }[];
}

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

  // --- AI script drafting via claude -p (Monday scripting block) ---

  // Draft script + caption for one idea and flip it to "scripted".
  const scriptIdea = useCallback(
    async (id: string) => {
      const idea = ideas.find((i) => i.id === id);
      if (!idea) throw new Error("idea not found");
      if (idea.hookFormula == null)
        throw new Error("assign a hook formula first — a topic isn't a post");
      const draft = await fetchScriptDraft(idea);
      await updateIdea(id, { ...draft, status: "scripted" });
    },
    [ideas, updateIdea]
  );

  // Draft the full weekly batch (2 BL + 1 WW + 1 UH per the cadence), in bank
  // order, never draining unscripted ideas below the 12-idea floor.
  const scriptWeeklyBatch = useCallback(
    async (onProgress?: (done: number, total: number) => void): Promise<BatchResult> => {
      const plan = planWeeklyBatch(ideas);
      const scripted: ContentIdea[] = [];
      const failed: BatchResult["failed"] = [];
      for (const idea of plan.toGenerate) {
        try {
          const draft = await fetchScriptDraft(idea);
          await updateIdea(idea.id, { ...draft, status: "scripted" });
          scripted.push(idea);
        } catch (e) {
          failed.push({ idea, error: e instanceof Error ? e.message : "draft failed" });
        }
        onProgress?.(scripted.length + failed.length, plan.toGenerate.length);
      }
      return { ...plan, scripted, failed };
    },
    [ideas, updateIdea]
  );

  return { ideas, loading, createIdea, updateIdea, deleteIdea, seedIdeas, scriptIdea, scriptWeeklyBatch };
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

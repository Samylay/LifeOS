"use client";

import { useCallback } from "react";
import { useCollection } from "./use-collection";
import type { Project } from "./types";

// Exit-velocity invariants:
// - an active project must name its shipping event (the external contact
//   point that counts as "shipped") — "when I'm happy with it" is not a status;
// - at most WIP_LIMIT projects are active at once; starting one means
//   shipping or killing one.
// Enforced here, the single write path for projects, so every UI inherits it.
// Legacy actives without a shippingEvent are tolerated on unrelated edits
// (the brief's staleness card surfaces them), but any edit touching status or
// shippingEvent must satisfy the invariant.
export const WIP_LIMIT = 3;

export function useProjects() {
  const { items: projects, loading, create, update, remove } = useCollection<Project>(
    "projects",
    { orderByField: "createdAt", orderDir: "desc", fallbackDates: ["createdAt", "updatedAt"] }
  );

  const activeCount = useCallback(
    (excludeId?: string) =>
      projects.filter((p) => p.status === "active" && p.id !== excludeId).length,
    [projects]
  );

  const createProject = useCallback(
    async (data: Omit<Project, "id" | "createdAt" | "updatedAt">) => {
      if (data.status === "active") {
        if (!data.shippingEvent?.trim()) {
          throw new Error("An active project needs a shipping event — name what leaving the machine looks like, or start it in Planning.");
        }
        if (activeCount() >= WIP_LIMIT) {
          throw new Error(`WIP limit: ${WIP_LIMIT} active projects. Ship or kill one first.`);
        }
      }
      const now = new Date();
      return await create({ ...data, createdAt: now, updatedAt: now });
    },
    [create, activeCount]
  );

  const updateProject = useCallback(
    async (id: string, data: Partial<Project>) => {
      const existing = projects.find((p) => p.id === id);
      const touchesInvariant = "status" in data || "shippingEvent" in data;
      if (existing && touchesInvariant) {
        const merged = { ...existing, ...data };
        if (merged.status === "active") {
          if (!merged.shippingEvent?.trim()) {
            throw new Error("An active project needs a shipping event — name what leaving the machine looks like first.");
          }
          if (existing.status !== "active" && activeCount(id) >= WIP_LIMIT) {
            throw new Error(`WIP limit: ${WIP_LIMIT} active projects. Ship or kill one first.`);
          }
        }
      }
      await update(id, { ...data, updatedAt: new Date() });
    },
    [update, projects, activeCount]
  );

  const deleteProject = useCallback(async (id: string) => remove(id), [remove]);

  return { projects, loading, createProject, updateProject, deleteProject };
}

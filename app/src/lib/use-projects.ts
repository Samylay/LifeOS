"use client";

import { useCallback } from "react";
import { useCollection } from "./use-collection";
import type { Project } from "./types";

export function useProjects() {
  const { items: projects, loading, create, update, remove } = useCollection<Project>(
    "projects",
    { orderByField: "createdAt", orderDir: "desc", fallbackDates: ["createdAt"] }
  );

  const createProject = useCallback(
    async (data: Omit<Project, "id" | "createdAt">) => {
      return await create({ ...data, createdAt: new Date() });
    },
    [create]
  );

  const updateProject = useCallback(
    async (id: string, data: Partial<Project>) => {
      await update(id, data);
    },
    [update]
  );

  const deleteProject = useCallback(async (id: string) => remove(id), [remove]);

  return { projects, loading, createProject, updateProject, deleteProject };
}

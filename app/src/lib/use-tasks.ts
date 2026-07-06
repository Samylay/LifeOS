"use client";

import { useCallback } from "react";
import { useCollection } from "./use-collection";
import type { Task } from "./types";

export function useTasks() {
  const { items: tasks, loading, create, update, remove } = useCollection<Task>(
    "tasks",
    { orderByField: "createdAt", orderDir: "desc" }
  );

  const createTask = useCallback(
    async (data: Omit<Task, "id" | "createdAt" | "updatedAt">) => {
      const now = new Date();
      await create({ ...data, createdAt: now, updatedAt: now });
    },
    [create]
  );

  const updateTask = useCallback(
    async (id: string, data: Partial<Task>) => {
      await update(id, { ...data, updatedAt: new Date() });
    },
    [update]
  );

  const deleteTask = useCallback(async (id: string) => remove(id), [remove]);

  return { tasks, loading, createTask, updateTask, deleteTask };
}

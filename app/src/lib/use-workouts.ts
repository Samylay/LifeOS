"use client";

import { useCallback } from "react";
import { useCollection } from "./use-collection";
import type { Workout, WorkoutTemplate } from "./types";

export function useWorkouts() {
  const { items: workouts, loading, create, update, remove } =
    useCollection<Workout>("workouts", {
      orderByField: "date",
      orderDir: "desc",
      fallbackDates: ["date", "createdAt"],
    });

  const {
    items: templates,
    create: createTemplateDoc,
    remove: removeTemplate,
  } = useCollection<WorkoutTemplate>("workoutTemplates", { fallbackDates: [] });

  const createWorkout = useCallback(
    async (data: Omit<Workout, "id" | "createdAt">) => {
      return await create({ ...data, createdAt: new Date() });
    },
    [create]
  );

  const updateWorkout = useCallback(
    async (id: string, data: Partial<Workout>) => {
      await update(id, data);
    },
    [update]
  );

  const deleteWorkout = useCallback(async (id: string) => remove(id), [remove]);

  const createTemplate = useCallback(
    async (data: Omit<WorkoutTemplate, "id">) => {
      return await createTemplateDoc(data);
    },
    [createTemplateDoc]
  );

  const deleteTemplate = useCallback(
    async (id: string) => removeTemplate(id),
    [removeTemplate]
  );

  // Stats
  const thisWeek = workouts.filter((w) => {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);
    return new Date(w.date) >= weekStart;
  });

  const thisMonth = workouts.filter((w) => {
    const now = new Date();
    return (
      new Date(w.date).getMonth() === now.getMonth() &&
      new Date(w.date).getFullYear() === now.getFullYear()
    );
  });

  return {
    workouts,
    templates,
    loading,
    createWorkout,
    updateWorkout,
    deleteWorkout,
    createTemplate,
    deleteTemplate,
    thisWeek,
    thisMonth,
  };
}

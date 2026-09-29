"use client";

import { useCallback } from "react";
import { useCollection } from "./use-collection";
import type { ProgramExercise } from "./types";

type SeedExercise = Omit<
  ProgramExercise,
  "id" | "createdAt" | "updatedAt" | "history"
>;

// Gym sessions of the 5 Oct 2026 to 31 Jan 2027 block (vault note
// 04-Areas/Health/workout-plan.md). Runs and mobility live in
// lib/training-plan.ts. Weights start from the last logged Strava sets
// (Aug/Sep 2026) and are re-set after the week 1 test.
const SEED_EXERCISES: SeedExercise[] = [
  // Monday: Gym A
  { day: "mon", order: 0, dayLabel: "Gym A", name: "Back squat", sets: 3, targetReps: 8, currentWeightKg: null },
  { day: "mon", order: 1, dayLabel: "Gym A", name: "Deadlift", sets: 3, targetReps: 5, currentWeightKg: 50 },
  { day: "mon", order: 2, dayLabel: "Gym A", name: "Lat pulldown", sets: 3, targetReps: 10, currentWeightKg: 30 },
  { day: "mon", order: 3, dayLabel: "Gym A", name: "Hanging knee raises", sets: 3, targetReps: 10, currentWeightKg: null },
  { day: "mon", order: 4, dayLabel: "Gym A", name: "Hollow hold (seconds)", sets: 3, targetReps: 30, repsSuffix: " s", currentWeightKg: null },

  // Wednesday: Gym B
  { day: "wed", order: 0, dayLabel: "Gym B", name: "Bench press", sets: 3, targetReps: 8, currentWeightKg: 50 },
  { day: "wed", order: 1, dayLabel: "Gym B", name: "Overhead press", sets: 3, targetReps: 8, currentWeightKg: 25 },
  { day: "wed", order: 2, dayLabel: "Gym B", name: "Barbell row", sets: 3, targetReps: 10, currentWeightKg: 30 },
  { day: "wed", order: 3, dayLabel: "Gym B", name: "Lateral raise", sets: 2, targetReps: 12, currentWeightKg: 7 },
  { day: "wed", order: 4, dayLabel: "Gym B", name: "Ab wheel or Pallof press", sets: 3, targetReps: 10, currentWeightKg: null },
  { day: "wed", order: 5, dayLabel: "Gym B", name: "Side plank (seconds)", sets: 2, targetReps: 30, repsSuffix: " s/side", currentWeightKg: null },
];

const EXERCISE_DEFAULTS: Partial<ProgramExercise> = { history: [] };

export function useProgram() {
  const { items: exercises, loading, create, update, remove } =
    useCollection<ProgramExercise>("programExercises", {
      orderByField: "order",
      orderDir: "asc",
      defaults: EXERCISE_DEFAULTS,
    });

  const createExercise = useCallback(
    (data: Omit<ProgramExercise, "id" | "createdAt" | "updatedAt">) => {
      const now = new Date();
      return create({ ...data, createdAt: now, updatedAt: now });
    },
    [create]
  );

  const updateExercise = useCallback(
    (id: string, data: Partial<ProgramExercise>) =>
      update(id, { ...data, updatedAt: new Date() }),
    [update]
  );

  const deleteExercise = useCallback((id: string) => remove(id), [remove]);

  // Bump the working weight for next time — the quick +/- stepper.
  const adjustWeight = useCallback(
    (id: string, deltaKg: number) => {
      const ex = exercises.find((e) => e.id === id);
      if (!ex) return;
      const base = ex.currentWeightKg ?? 0;
      const next = Math.max(0, Math.round((base + deltaKg) * 2) / 2); // nearest 0.5kg
      return updateExercise(id, { currentWeightKg: next });
    },
    [exercises, updateExercise]
  );

  // Log today's session at the current working weight (editable reps).
  const logSession = useCallback(
    (id: string, reps?: number, date: Date = new Date()) => {
      const ex = exercises.find((e) => e.id === id);
      if (!ex) return;
      const history = [...ex.history, { date, weightKg: ex.currentWeightKg, reps }];
      return updateExercise(id, { history });
    },
    [exercises, updateExercise]
  );

  const undoLastLog = useCallback(
    (id: string) => {
      const ex = exercises.find((e) => e.id === id);
      if (!ex || ex.history.length === 0) return;
      return updateExercise(id, { history: ex.history.slice(0, -1) });
    },
    [exercises, updateExercise]
  );

  const seedDefaults = useCallback(async () => {
    for (const ex of SEED_EXERCISES) {
      await createExercise({ ...ex, history: [] });
    }
  }, [createExercise]);

  const byDay = useCallback(
    (day: ProgramExercise["day"]) =>
      exercises.filter((e) => e.day === day).sort((a, b) => a.order - b.order),
    [exercises]
  );

  return {
    exercises,
    loading,
    byDay,
    createExercise,
    updateExercise,
    deleteExercise,
    adjustWeight,
    logSession,
    undoLastLog,
    seedDefaults,
  };
}

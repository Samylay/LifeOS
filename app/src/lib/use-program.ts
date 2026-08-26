"use client";

import { useCallback } from "react";
import { useCollection } from "./use-collection";
import type { ProgramExercise } from "./types";

type SeedExercise = Omit<
  ProgramExercise,
  "id" | "createdAt" | "updatedAt" | "history"
>;

// Pulled from the school-PC plan (~/Downloads/pplppl-workout-plan.md,
// 2026-08-26). Rep ranges resolved to the top per the user's rule; the
// either/or exercises resolved to: dumbbell curl, Pallof press, pec deck,
// conventional deadlift. Weights start at null (no tracked load yet) —
// filled in from the first logged session.
const SEED_EXERCISES: SeedExercise[] = [
  // Monday — Push
  { day: "mon", order: 0, dayLabel: "Push", name: "Barbell bench press", sets: 3, targetReps: 8, currentWeightKg: 40 },
  { day: "mon", order: 1, dayLabel: "Push", name: "Incline dumbbell press", sets: 3, targetReps: 10, currentWeightKg: 12 },
  { day: "mon", order: 2, dayLabel: "Push", name: "Seated dumbbell shoulder press", sets: 3, targetReps: 10, currentWeightKg: 10 },
  { day: "mon", order: 3, dayLabel: "Push", name: "Cable lateral raise", sets: 3, targetReps: 15, currentWeightKg: 4 },
  { day: "mon", order: 4, dayLabel: "Push", name: "Triceps rope pushdown", sets: 2, targetReps: 12, currentWeightKg: null },

  // Tuesday — Pull
  { day: "tue", order: 0, dayLabel: "Pull", name: "Lat pulldown", sets: 3, targetReps: 8, currentWeightKg: 25 },
  { day: "tue", order: 1, dayLabel: "Pull", name: "Machine row", sets: 3, targetReps: 10, currentWeightKg: 25 },
  { day: "tue", order: 2, dayLabel: "Pull", name: "Seated cable row", sets: 3, targetReps: 12, currentWeightKg: 25 },
  { day: "tue", order: 3, dayLabel: "Pull", name: "Face pull", sets: 3, targetReps: 15, currentWeightKg: null },
  { day: "tue", order: 4, dayLabel: "Pull", name: "Dumbbell curl", sets: 2, targetReps: 12, currentWeightKg: 10 },

  // Wednesday — Legs (plyometrics, light)
  { day: "wed", order: 0, dayLabel: "Legs (plyo)", name: "Dynamic mobility warm-up", sets: 1, targetReps: 8, repsSuffix: " min", currentWeightKg: null },
  { day: "wed", order: 1, dayLabel: "Legs (plyo)", name: "Box jumps", sets: 3, targetReps: 5, currentWeightKg: null },
  { day: "wed", order: 2, dayLabel: "Legs (plyo)", name: "Lateral bounds", sets: 2, targetReps: 6, repsSuffix: "/side", currentWeightKg: null },
  { day: "wed", order: 3, dayLabel: "Legs (plyo)", name: "Pallof press", sets: 2, targetReps: 12, currentWeightKg: null },

  // Thursday — Push
  { day: "thu", order: 0, dayLabel: "Push", name: "Overhead barbell press", sets: 3, targetReps: 8, currentWeightKg: 20 },
  { day: "thu", order: 1, dayLabel: "Push", name: "Flat dumbbell press", sets: 3, targetReps: 10, currentWeightKg: 12 },
  { day: "thu", order: 2, dayLabel: "Push", name: "Pec deck", sets: 3, targetReps: 12, currentWeightKg: null },
  { day: "thu", order: 3, dayLabel: "Push", name: "Dumbbell lateral raise", sets: 3, targetReps: 15, currentWeightKg: 4 },
  { day: "thu", order: 4, dayLabel: "Push", name: "Close-grip bench press", sets: 2, targetReps: 10, currentWeightKg: 30 },

  // Friday — Pull
  { day: "fri", order: 0, dayLabel: "Pull", name: "Deadlift (conventional)", sets: 3, targetReps: 5, currentWeightKg: 40 },
  { day: "fri", order: 1, dayLabel: "Pull", name: "Chest-supported row", sets: 3, targetReps: 10, currentWeightKg: 25 },
  { day: "fri", order: 2, dayLabel: "Pull", name: "Rear delt fly", sets: 3, targetReps: 15, currentWeightKg: null },
  { day: "fri", order: 3, dayLabel: "Pull", name: "Preacher curl", sets: 2, targetReps: 12, currentWeightKg: 10 },

  // Saturday — Legs (heavy)
  { day: "sat", order: 0, dayLabel: "Legs (heavy)", name: "Back squat", sets: 3, targetReps: 6, currentWeightKg: 20 },
  { day: "sat", order: 1, dayLabel: "Legs (heavy)", name: "Romanian deadlift", sets: 3, targetReps: 10, currentWeightKg: 30 },
  { day: "sat", order: 2, dayLabel: "Legs (heavy)", name: "Walking lunge", sets: 3, targetReps: 10, repsSuffix: "/leg", currentWeightKg: null },
  { day: "sat", order: 3, dayLabel: "Legs (heavy)", name: "Leg press", sets: 3, targetReps: 12, currentWeightKg: null },
  { day: "sat", order: 4, dayLabel: "Legs (heavy)", name: "Leg curl", sets: 2, targetReps: 12, currentWeightKg: null },
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

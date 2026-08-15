"use client";

import { useCallback } from "react";
import { useCollection } from "./use-collection";
import { localDayOf } from "./types";
import type { Habit, AreaId } from "./types";

export interface HabitWithArea extends Habit {
  area?: AreaId;
}

type HabitEntry = Habit["history"][number];

/**
 * The history and streak a toggle produces. Pure, so the day-boundary maths is
 * testable without a React tree.
 *
 * Keys are civil days (`localDayOf`), never `toISOString()`. In any zone ahead
 * of UTC — Europe/Paris included — local midnight converts to the *previous*
 * UTC date, so the old UTC keys meant a habit ticked after midnight was written
 * against yesterday and the streak cursor started on a day that could never
 * match. Today was never counted.
 */
export function toggledHabitState(
  history: HabitEntry[],
  now: Date = new Date()
): { history: HabitEntry[]; streak: number } {
  const today = localDayOf(now);
  const todayEntry = history.find((h) => h.date === today);
  const newHistory = todayEntry
    ? history.map((h) => (h.date === today ? { ...h, completed: !h.completed } : h))
    : [...history, { date: today, completed: true }];

  // Count consecutive completed days backwards from today.
  const completedDates = new Set(
    newHistory.filter((h) => h.completed).map((h) => h.date)
  );
  let streak = 0;
  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  while (completedDates.has(localDayOf(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }

  return { history: newHistory, streak };
}

export function useHabits() {
  const { items: habits, loading, create, update, remove } =
    useCollection<HabitWithArea>("habits", { fallbackDates: [] });

  const createHabit = useCallback(
    async (data: Omit<HabitWithArea, "id">) => {
      return await create(data);
    },
    [create]
  );

  const updateHabit = useCallback(
    async (id: string, data: Partial<HabitWithArea>) => {
      await update(id, data);
    },
    [update]
  );

  const deleteHabit = useCallback(async (id: string) => remove(id), [remove]);

  const toggleToday = useCallback(
    async (id: string) => {
      const habit = habits.find((h) => h.id === id);
      if (!habit) return;

      const { history, streak } = toggledHabitState(habit.history);
      await updateHabit(id, { history, streak });
    },
    [habits, updateHabit]
  );

  return { habits, loading, createHabit, updateHabit, deleteHabit, toggleToday };
}

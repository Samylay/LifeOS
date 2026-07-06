"use client";

import { useCallback } from "react";
import { useCollection } from "./use-collection";
import type { Habit, AreaId } from "./types";

export interface HabitWithArea extends Habit {
  area?: AreaId;
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

      const today = new Date().toISOString().split("T")[0];
      const todayEntry = habit.history.find((h) => h.date === today);
      const newHistory = todayEntry
        ? habit.history.map((h) =>
            h.date === today ? { ...h, completed: !h.completed } : h
          )
        : [...habit.history, { date: today, completed: true }];

      // Recompute streak from history by counting consecutive completed days backwards from today
      const completedDates = new Set(
        newHistory.filter((h) => h.completed).map((h) => h.date)
      );
      let streak = 0;
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      while (completedDates.has(d.toISOString().split("T")[0])) {
        streak++;
        d.setDate(d.getDate() - 1);
      }

      await updateHabit(id, { history: newHistory, streak });
    },
    [habits, updateHabit]
  );

  return { habits, loading, createHabit, updateHabit, deleteHabit, toggleToday };
}

"use client";

import { useCallback, useMemo } from "react";
import { useCollection } from "./use-collection";
import type { Habit, AreaId } from "./types";
import { notifyWrite } from "./local-db";
import { scheduledToggle, sortHabits } from "./habit-schedule";

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
  return scheduledToggle({ history, frequency: "daily" }, now);
}

export function useHabits() {
  const { items, loading, error } =
    useCollection<HabitWithArea>("habits", { fallbackDates: [] });
  const habits = useMemo(() => sortHabits(items), [items]);

  const write = useCallback(async (method: string, id?: string, data?: unknown) => {
    const path = `users/local/habits${id ? `/${encodeURIComponent(id)}` : ""}`;
    const res = await fetch(`/api/data/${path}`, {
      method, headers: { "Content-Type": "application/json" }, body: data === undefined ? undefined : JSON.stringify(data),
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(result.error ?? "Could not save the habit. Try again.");
    notifyWrite(path);
    return result;
  }, []);

  const createHabit = useCallback(
    async (data: Omit<HabitWithArea, "id">) => {
      return String((await write("POST", undefined, data)).id);
    },
    [write]
  );

  const updateHabit = useCallback(
    async (id: string, data: Partial<HabitWithArea>) => {
      await write("PATCH", id, data);
    },
    [write]
  );

  const deleteHabit = useCallback(async (id: string) => { await write("DELETE", id); }, [write]);

  const toggleToday = useCallback(
    async (id: string) => {
      const habit = habits.find((h) => h.id === id);
      if (!habit) return;

      const { history, streak } = scheduledToggle(habit);
      await updateHabit(id, { history, streak });
    },
    [habits, updateHabit]
  );

  return { habits, loading, error, createHabit, updateHabit, deleteHabit, toggleToday };
}

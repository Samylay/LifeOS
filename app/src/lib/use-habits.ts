"use client";

import { useState, useEffect, useCallback } from "react";
import { collection, onSnapshot, query } from "firebase/firestore";
import { db, isConfigured } from "./firebase";
import { habits as habitsApi } from "./firestore";
import type { Habit, AreaId } from "./types";
import { useAuth } from "./auth-context";

let localIdCounter = 0;

export interface HabitWithArea extends Habit {
  area?: AreaId;
}

export function useHabits() {
  const { user, isFirebaseConfigured } = useAuth();
  const [habits, setHabits] = useState<HabitWithArea[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isFirebaseConfigured || !user || !db) {
      setLoading(false);
      return;
    }

    const q = query(collection(db, `users/${user.uid}/habits`));

    const unsubscribe = onSnapshot(q, (snap) => {
      const items = snap.docs.map((doc) => {
        const data = doc.data();
        return { ...data, id: doc.id } as HabitWithArea;
      });
      setHabits(items);
      setLoading(false);
    });

    return unsubscribe;
  }, [user, isFirebaseConfigured]);

  const createHabit = useCallback(
    async (data: Omit<HabitWithArea, "id">) => {
      if (isFirebaseConfigured && user) {
        return await habitsApi.create(user.uid, data);
      } else {
        const newHabit: HabitWithArea = {
          ...data,
          id: `local-habit-${++localIdCounter}`,
        };
        setHabits((prev) => [...prev, newHabit]);
        return newHabit.id;
      }
    },
    [user, isFirebaseConfigured]
  );

  const updateHabit = useCallback(
    async (id: string, data: Partial<HabitWithArea>) => {
      if (isFirebaseConfigured && user) {
        await habitsApi.update(user.uid, id, data);
      } else {
        setHabits((prev) =>
          prev.map((h) => (h.id === id ? { ...h, ...data } : h))
        );
      }
    },
    [user, isFirebaseConfigured]
  );

  const deleteHabit = useCallback(
    async (id: string) => {
      if (isFirebaseConfigured && user) {
        await habitsApi.delete(user.uid, id);
      } else {
        setHabits((prev) => prev.filter((h) => h.id !== id));
      }
    },
    [user, isFirebaseConfigured]
  );

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

      const isNowCompleted = !todayEntry?.completed;
      const newStreak = isNowCompleted ? habit.streak + 1 : Math.max(0, habit.streak - 1);

      await updateHabit(id, { history: newHistory, streak: newStreak });
    },
    [habits, updateHabit]
  );

  return { habits, loading, createHabit, updateHabit, deleteHabit, toggleToday };
}

"use client";

import { useState, useEffect, useCallback } from "react";
import { collection, onSnapshot, query, where, orderBy } from "firebase/firestore";
import { db, isConfigured } from "./firebase";
import { goals as goalsApi } from "./firestore";
import type { Goal } from "./types";
import { useAuth } from "./auth-context";

let localIdCounter = 0;

export function useGoals(year?: number) {
  const { user, isFirebaseConfigured } = useAuth();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const targetYear = year || new Date().getFullYear();

  useEffect(() => {
    if (!isFirebaseConfigured || !user || !db) {
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, `users/${user.uid}/goals`),
      where("year", "==", targetYear)
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const items = snap.docs.map((doc) => {
        const data = doc.data();
        return { ...data, id: doc.id } as Goal;
      });
      setGoals(items);
      setLoading(false);
    });

    return unsubscribe;
  }, [user, isFirebaseConfigured, targetYear]);

  const createGoal = useCallback(
    async (data: Omit<Goal, "id">) => {
      if (isFirebaseConfigured && user) {
        return await goalsApi.create(user.uid, data);
      } else {
        const newGoal: Goal = {
          ...data,
          id: `local-goal-${++localIdCounter}`,
        };
        setGoals((prev) => [...prev, newGoal]);
        return newGoal.id;
      }
    },
    [user, isFirebaseConfigured]
  );

  const updateGoal = useCallback(
    async (id: string, data: Partial<Goal>) => {
      if (isFirebaseConfigured && user) {
        await goalsApi.update(user.uid, id, data);
      } else {
        setGoals((prev) =>
          prev.map((g) => (g.id === id ? { ...g, ...data } : g))
        );
      }
    },
    [user, isFirebaseConfigured]
  );

  const deleteGoal = useCallback(
    async (id: string) => {
      if (isFirebaseConfigured && user) {
        await goalsApi.delete(user.uid, id);
      } else {
        setGoals((prev) => prev.filter((g) => g.id !== id));
      }
    },
    [user, isFirebaseConfigured]
  );

  return { goals, loading, createGoal, updateGoal, deleteGoal };
}

"use client";

import { useState, useEffect, useCallback } from "react";
import { doc, onSnapshot } from "@/lib/local-db";
import { db } from "./local-db";
import { mealPlans as api } from "./firestore";
import type { MealPlan, MealDay, MealSlot, MealPlanEntry } from "./types";
import { useAuth } from "./auth-context";

/** Returns the YYYY-MM-DD date of the Monday of the current week. */
export function getWeekStart(d: Date = new Date()): string {
  const date = new Date(d);
  const day = date.getDay(); // 0 = Sun, 1 = Mon, ...
  const diff = day === 0 ? -6 : 1 - day; // shift to Monday
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date.toISOString().split("T")[0];
}

export function useMealPlan(weekId: string) {
  const { user, isFirebaseConfigured } = useAuth();
  const [plan, setPlan] = useState<MealPlan | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isFirebaseConfigured || !user || !db) {
      setLoading(false);
      return;
    }

    const ref = doc(db, `users/${user.uid}/mealplan`, weekId);
    const unsubscribe = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        const d = snap.data();
        setPlan({
          ...d,
          id: weekId,
          updatedAt: d.updatedAt?.toDate?.() || new Date(),
        } as MealPlan);
      } else {
        setPlan({ id: weekId, weekOf: weekId, meals: {}, updatedAt: new Date() });
      }
      setLoading(false);
    });

    return unsubscribe;
  }, [user, isFirebaseConfigured, weekId]);

  const setMeal = useCallback(
    async (day: MealDay, slot: MealSlot, entry: MealPlanEntry | null) => {
      const current = plan?.meals || {};
      const dayMeals = { ...(current[day] || {}) };
      if (entry === null) {
        delete dayMeals[slot];
      } else {
        dayMeals[slot] = entry;
      }
      const meals = { ...current, [day]: dayMeals };
      const now = new Date();

      if (isFirebaseConfigured && user) {
        await api.set(user.uid, weekId, { weekOf: weekId, meals, updatedAt: now });
      } else {
        setPlan({ id: weekId, weekOf: weekId, meals, updatedAt: now });
      }
    },
    [plan, user, isFirebaseConfigured, weekId]
  );

  return { plan, loading, setMeal };
}

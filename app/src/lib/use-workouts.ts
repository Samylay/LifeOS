"use client";

import { useState, useEffect, useCallback } from "react";
import { collection, onSnapshot, query, orderBy, Timestamp } from "firebase/firestore";
import { db } from "./firebase";
import { workouts as workoutsApi, workoutTemplates as templatesApi } from "./firestore";
import type { Workout, WorkoutTemplate, WorkoutExercise } from "./types";
import { useAuth } from "./auth-context";

let localIdCounter = 0;

export function useWorkouts() {
  const { user, isFirebaseConfigured } = useAuth();
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isFirebaseConfigured || !user || !db) {
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, `users/${user.uid}/workouts`),
      orderBy("date", "desc")
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const items = snap.docs.map((doc) => {
        const data = doc.data();
        return {
          ...data,
          id: doc.id,
          date: data.date?.toDate?.() || new Date(),
          createdAt: data.createdAt?.toDate?.() || new Date(),
        } as Workout;
      });
      setWorkouts(items);
      setLoading(false);
    });

    return unsubscribe;
  }, [user, isFirebaseConfigured]);

  // Templates listener
  useEffect(() => {
    if (!isFirebaseConfigured || !user || !db) return;

    const q = query(collection(db, `users/${user.uid}/workoutTemplates`));
    const unsubscribe = onSnapshot(q, (snap) => {
      const items = snap.docs.map((doc) => ({
        ...doc.data(),
        id: doc.id,
      })) as WorkoutTemplate[];
      setTemplates(items);
    });

    return unsubscribe;
  }, [user, isFirebaseConfigured]);

  const createWorkout = useCallback(
    async (data: Omit<Workout, "id" | "createdAt">) => {
      const now = new Date();
      if (isFirebaseConfigured && user) {
        return await workoutsApi.create(user.uid, { ...data, createdAt: now });
      } else {
        const newWorkout: Workout = {
          ...data,
          id: `local-workout-${++localIdCounter}`,
          createdAt: now,
        };
        setWorkouts((prev) => [newWorkout, ...prev]);
        return newWorkout.id;
      }
    },
    [user, isFirebaseConfigured]
  );

  const updateWorkout = useCallback(
    async (id: string, data: Partial<Workout>) => {
      if (isFirebaseConfigured && user) {
        await workoutsApi.update(user.uid, id, data);
      } else {
        setWorkouts((prev) =>
          prev.map((w) => (w.id === id ? { ...w, ...data } : w))
        );
      }
    },
    [user, isFirebaseConfigured]
  );

  const deleteWorkout = useCallback(
    async (id: string) => {
      if (isFirebaseConfigured && user) {
        await workoutsApi.delete(user.uid, id);
      } else {
        setWorkouts((prev) => prev.filter((w) => w.id !== id));
      }
    },
    [user, isFirebaseConfigured]
  );

  const createTemplate = useCallback(
    async (data: Omit<WorkoutTemplate, "id">) => {
      if (isFirebaseConfigured && user) {
        return await templatesApi.create(user.uid, data);
      } else {
        const t: WorkoutTemplate = {
          ...data,
          id: `local-template-${++localIdCounter}`,
        };
        setTemplates((prev) => [...prev, t]);
        return t.id;
      }
    },
    [user, isFirebaseConfigured]
  );

  const deleteTemplate = useCallback(
    async (id: string) => {
      if (isFirebaseConfigured && user) {
        await templatesApi.delete(user.uid, id);
      } else {
        setTemplates((prev) => prev.filter((t) => t.id !== id));
      }
    },
    [user, isFirebaseConfigured]
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

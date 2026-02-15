"use client";

import { useState, useEffect, useCallback } from "react";
import { collection, onSnapshot, query, orderBy, Timestamp } from "firebase/firestore";
import { db, isConfigured } from "./firebase";
import { tasks as tasksApi } from "./firestore";
import type { Task, TaskStatus, TaskPriority, AreaId } from "./types";
import { useAuth } from "./auth-context";

// Local-only fallback for demo mode
let localIdCounter = 0;

export function useTasks() {
  const { user, isFirebaseConfigured } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  // Real-time listener when Firebase is configured
  useEffect(() => {
    if (!isFirebaseConfigured || !user || !db) {
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, `users/${user.uid}/tasks`),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const items = snap.docs.map((doc) => {
        const data = doc.data();
        return {
          ...data,
          id: doc.id,
          createdAt: data.createdAt?.toDate?.() || new Date(),
          updatedAt: data.updatedAt?.toDate?.() || new Date(),
          dueDate: data.dueDate?.toDate?.() || undefined,
        } as Task;
      });
      setTasks(items);
      setLoading(false);
    });

    return unsubscribe;
  }, [user, isFirebaseConfigured]);

  const createTask = useCallback(
    async (data: Omit<Task, "id" | "createdAt" | "updatedAt">) => {
      const now = new Date();
      if (isFirebaseConfigured && user) {
        await tasksApi.create(user.uid, {
          ...data,
          createdAt: now,
          updatedAt: now,
        });
      } else {
        // Local mode
        const newTask: Task = {
          ...data,
          id: `local-${++localIdCounter}`,
          createdAt: now,
          updatedAt: now,
        };
        setTasks((prev) => [newTask, ...prev]);
      }
    },
    [user, isFirebaseConfigured]
  );

  const updateTask = useCallback(
    async (id: string, data: Partial<Task>) => {
      if (isFirebaseConfigured && user) {
        await tasksApi.update(user.uid, id, { ...data, updatedAt: new Date() });
      } else {
        setTasks((prev) =>
          prev.map((t) => (t.id === id ? { ...t, ...data, updatedAt: new Date() } : t))
        );
      }
    },
    [user, isFirebaseConfigured]
  );

  const deleteTask = useCallback(
    async (id: string) => {
      if (isFirebaseConfigured && user) {
        await tasksApi.delete(user.uid, id);
      } else {
        setTasks((prev) => prev.filter((t) => t.id !== id));
      }
    },
    [user, isFirebaseConfigured]
  );

  return { tasks, loading, createTask, updateTask, deleteTask };
}

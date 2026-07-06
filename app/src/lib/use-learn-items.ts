"use client";

import { useState, useEffect, useCallback } from "react";
import { collection, onSnapshot, query, orderBy } from "@/lib/local-db";
import { db } from "./firebase";
import { learnItems as api } from "./firestore";
import type { LearnItem } from "./types";
import { useAuth } from "./auth-context";

let localIdCounter = 0;

export function useLearnItems() {
  const { user, isFirebaseConfigured } = useAuth();
  const [items, setItems] = useState<LearnItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isFirebaseConfigured || !user || !db) {
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, `users/${user.uid}/learnItems`),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const data = snap.docs.map((doc) => {
        const d = doc.data();
        return {
          ...d,
          id: doc.id,
          createdAt: d.createdAt?.toDate?.() || new Date(),
          updatedAt: d.updatedAt?.toDate?.() || new Date(),
        } as LearnItem;
      });
      setItems(data);
      setLoading(false);
    });

    return unsubscribe;
  }, [user, isFirebaseConfigured]);

  const createItem = useCallback(
    async (data: Omit<LearnItem, "id" | "createdAt" | "updatedAt">) => {
      const now = new Date();
      if (isFirebaseConfigured && user) {
        return await api.create(user.uid, { ...data, createdAt: now, updatedAt: now });
      } else {
        const item: LearnItem = {
          ...data,
          id: `local-learn-${++localIdCounter}`,
          createdAt: now,
          updatedAt: now,
        };
        setItems((prev) => [item, ...prev]);
        return item.id;
      }
    },
    [user, isFirebaseConfigured]
  );

  const updateItem = useCallback(
    async (id: string, data: Partial<LearnItem>) => {
      const patch = { ...data, updatedAt: new Date() };
      if (isFirebaseConfigured && user) {
        await api.update(user.uid, id, patch);
      } else {
        setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
      }
    },
    [user, isFirebaseConfigured]
  );

  const deleteItem = useCallback(
    async (id: string) => {
      if (isFirebaseConfigured && user) {
        await api.delete(user.uid, id);
      } else {
        setItems((prev) => prev.filter((i) => i.id !== id));
      }
    },
    [user, isFirebaseConfigured]
  );

  return { items, loading, createItem, updateItem, deleteItem };
}

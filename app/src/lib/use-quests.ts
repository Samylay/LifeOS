"use client";

import { useState, useEffect, useCallback } from "react";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { db, isConfigured } from "./firebase";
import { quests as questsApi } from "./firestore";
import type { Quest } from "./types";
import { useAuth } from "./auth-context";

let localIdCounter = 0;

export function useQuests() {
  const { user, isFirebaseConfigured } = useAuth();
  const [quests, setQuests] = useState<Quest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isFirebaseConfigured || !user || !db) {
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, `users/${user.uid}/quests`),
      orderBy("startDate", "desc")
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const items = snap.docs.map((doc) => {
        const data = doc.data();
        return {
          ...data,
          id: doc.id,
          startDate: data.startDate?.toDate?.() || new Date(),
          endDate: data.endDate?.toDate?.() || new Date(),
        } as Quest;
      });
      setQuests(items);
      setLoading(false);
    });

    return unsubscribe;
  }, [user, isFirebaseConfigured]);

  const createQuest = useCallback(
    async (data: Omit<Quest, "id">) => {
      if (isFirebaseConfigured && user) {
        return await questsApi.create(user.uid, data);
      } else {
        const newQuest: Quest = {
          ...data,
          id: `local-quest-${++localIdCounter}`,
        };
        setQuests((prev) => [newQuest, ...prev]);
        return newQuest.id;
      }
    },
    [user, isFirebaseConfigured]
  );

  const updateQuest = useCallback(
    async (id: string, data: Partial<Quest>) => {
      if (isFirebaseConfigured && user) {
        await questsApi.update(user.uid, id, data);
      } else {
        setQuests((prev) =>
          prev.map((q) => (q.id === id ? { ...q, ...data } : q))
        );
      }
    },
    [user, isFirebaseConfigured]
  );

  const deleteQuest = useCallback(
    async (id: string) => {
      if (isFirebaseConfigured && user) {
        await questsApi.delete(user.uid, id);
      } else {
        setQuests((prev) => prev.filter((q) => q.id !== id));
      }
    },
    [user, isFirebaseConfigured]
  );

  const activeQuests = quests.filter((q) => {
    const now = new Date();
    return now >= q.startDate && now <= q.endDate && q.progress < 100;
  });

  return { quests, activeQuests, loading, createQuest, updateQuest, deleteQuest };
}

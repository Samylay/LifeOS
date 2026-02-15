"use client";

import { useState, useEffect, useCallback } from "react";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { db, isConfigured } from "./firebase";
import { finance } from "./firestore";
import type { Subscription } from "./types";
import { useAuth } from "./auth-context";

let localIdCounter = 0;

export function useSubscriptions() {
  const { user, isFirebaseConfigured } = useAuth();
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isFirebaseConfigured || !user || !db) {
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, `users/${user.uid}/finance/data/subscriptions`),
      orderBy("renewalDate", "asc")
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const items = snap.docs.map((doc) => {
        const data = doc.data();
        return {
          ...data,
          id: doc.id,
          renewalDate: data.renewalDate?.toDate?.() || new Date(),
        } as Subscription;
      });
      setSubscriptions(items);
      setLoading(false);
    });

    return unsubscribe;
  }, [user, isFirebaseConfigured]);

  const createSubscription = useCallback(
    async (data: Omit<Subscription, "id">) => {
      if (isFirebaseConfigured && user) {
        return await finance.subscriptions.create(user.uid, data);
      } else {
        const newSub: Subscription = {
          ...data,
          id: `local-sub-${++localIdCounter}`,
        };
        setSubscriptions((prev) => [...prev, newSub]);
        return newSub.id;
      }
    },
    [user, isFirebaseConfigured]
  );

  const updateSubscription = useCallback(
    async (id: string, data: Partial<Subscription>) => {
      if (isFirebaseConfigured && user) {
        await finance.subscriptions.update(user.uid, id, data);
      } else {
        setSubscriptions((prev) =>
          prev.map((s) => (s.id === id ? { ...s, ...data } : s))
        );
      }
    },
    [user, isFirebaseConfigured]
  );

  const deleteSubscription = useCallback(
    async (id: string) => {
      if (isFirebaseConfigured && user) {
        await finance.subscriptions.delete(user.uid, id);
      } else {
        setSubscriptions((prev) => prev.filter((s) => s.id !== id));
      }
    },
    [user, isFirebaseConfigured]
  );

  const totalMonthlyCost = subscriptions.reduce((sum, sub) => {
    return sum + (sub.frequency === "yearly" ? sub.cost / 12 : sub.cost);
  }, 0);

  return { subscriptions, loading, createSubscription, updateSubscription, deleteSubscription, totalMonthlyCost };
}

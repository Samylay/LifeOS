"use client";

import { useState, useEffect, useCallback } from "react";
import { collection, onSnapshot, query, orderBy } from "@/lib/local-db";
import { db } from "./firebase";
import { learnItems as api } from "./firestore";
import type { LearnItem } from "./types";
import { useAuth } from "./auth-context";

let localIdCounter = 0;

const SEED_ITEMS: Omit<LearnItem, "id" | "createdAt" | "updatedAt">[] = [
  {
    topic: "Chess openings",
    why: "Long-standing interest; want to actually understand the principles, not just memorize lines.",
    firstStep:
      "Pick one opening to learn deeply (e.g. a single response to 1.e4) rather than skimming many.",
    status: "parked",
  },
  {
    topic: "Vocal harmony",
    why: "Interest sparked by Matt Pocock's list; pairs with the spoken-English / vocal-variety thread already running in Daily Prime.",
    firstStep: "Learn to hold a simple third above a melody by ear.",
    status: "parked",
  },
  {
    topic: "Spoken English — depth of thought & expression",
    why: "Top learning priority. Counter the attrition from a reading-heavy / speaking-light routine; build depth, not mechanics.",
    firstStep: "Read quality long-form prose daily + run regular speaking-practice sessions. (Daily Prime is the forced rep.)",
    status: "learning",
  },
  {
    topic: "Japanese",
    why: "Daily practice toward the Sendai immersion milestone (Tohoku TIE summer program).",
    firstStep: "Hold a daily streak through the Japan trip; don't break the chain.",
    status: "learning",
  },
  {
    topic: "SEO fundamentals",
    why: "Get samylayaida.com properly indexed and discoverable.",
    firstStep: "Submit sitemap.xml in Google Search Console, add internal links homepage → subpages, then check indexation.",
    status: "parked",
  },
  {
    topic: "Logic & ethics (reading list)",
    why: "Sharpen argument and moral reasoning. Core three: Sandel's Justice, McInerny's Being Logical, Haidt's The Righteous Mind.",
    firstStep: "Start with Sandel's Justice (or the free Harvard lectures).",
    status: "parked",
  },
];

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

  const seedDefaults = useCallback(async () => {
    for (const it of SEED_ITEMS) {
      await createItem(it);
    }
  }, [createItem]);

  return { items, loading, createItem, updateItem, deleteItem, seedDefaults };
}

"use client";

import { useState, useEffect, useCallback } from "react";
import { collection, onSnapshot, query, orderBy } from "@/lib/local-db";
import { db } from "./firebase";
import { recipes as api } from "./firestore";
import type { Recipe } from "./types";
import { useAuth } from "./auth-context";

let localIdCounter = 0;

export function useRecipes() {
  const { user, isFirebaseConfigured } = useAuth();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isFirebaseConfigured || !user || !db) {
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, `users/${user.uid}/recipes`),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const data = snap.docs.map((doc) => {
        const d = doc.data();
        return {
          ...d,
          id: doc.id,
          createdAt: d.createdAt?.toDate?.() || new Date(),
        } as Recipe;
      });
      setRecipes(data);
      setLoading(false);
    });

    return unsubscribe;
  }, [user, isFirebaseConfigured]);

  const createRecipe = useCallback(
    async (data: Omit<Recipe, "id" | "createdAt">) => {
      const now = new Date();
      if (isFirebaseConfigured && user) {
        await api.create(user.uid, { ...data, createdAt: now });
      } else {
        const newRecipe: Recipe = {
          ...data,
          id: `local-${++localIdCounter}`,
          createdAt: now,
        };
        setRecipes((prev) => [newRecipe, ...prev]);
      }
    },
    [user, isFirebaseConfigured]
  );

  const updateRecipe = useCallback(
    async (id: string, data: Partial<Recipe>) => {
      if (isFirebaseConfigured && user) {
        await api.update(user.uid, id, data);
      } else {
        setRecipes((prev) =>
          prev.map((r) => (r.id === id ? { ...r, ...data } : r))
        );
      }
    },
    [user, isFirebaseConfigured]
  );

  const deleteRecipe = useCallback(
    async (id: string) => {
      if (isFirebaseConfigured && user) {
        await api.delete(user.uid, id);
      } else {
        setRecipes((prev) => prev.filter((r) => r.id !== id));
      }
    },
    [user, isFirebaseConfigured]
  );

  return { recipes, loading, createRecipe, updateRecipe, deleteRecipe };
}

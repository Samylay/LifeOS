"use client";

import { useState, useEffect, useCallback } from "react";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { db } from "./firebase";
import { shoppingItems as api } from "./firestore";
import type { ShoppingItem } from "./types";
import { useAuth } from "./auth-context";

let localIdCounter = 0;

export function useShoppingList() {
  const { user, isFirebaseConfigured } = useAuth();
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isFirebaseConfigured || !user || !db) {
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, `users/${user.uid}/shoppingItems`),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const data = snap.docs.map((doc) => {
        const d = doc.data();
        return {
          ...d,
          id: doc.id,
          createdAt: d.createdAt?.toDate?.() || new Date(),
        } as ShoppingItem;
      });
      setItems(data);
      setLoading(false);
    });

    return unsubscribe;
  }, [user, isFirebaseConfigured]);

  const addItem = useCallback(
    async (data: Omit<ShoppingItem, "id" | "createdAt">) => {
      const now = new Date();
      if (isFirebaseConfigured && user) {
        await api.create(user.uid, { ...data, createdAt: now });
      } else {
        const newItem: ShoppingItem = {
          ...data,
          id: `local-${++localIdCounter}`,
          createdAt: now,
        };
        setItems((prev) => [newItem, ...prev]);
      }
    },
    [user, isFirebaseConfigured]
  );

  const updateItem = useCallback(
    async (id: string, data: Partial<ShoppingItem>) => {
      if (isFirebaseConfigured && user) {
        await api.update(user.uid, id, data);
      } else {
        setItems((prev) =>
          prev.map((item) => (item.id === id ? { ...item, ...data } : item))
        );
      }
    },
    [user, isFirebaseConfigured]
  );

  const deleteItem = useCallback(
    async (id: string) => {
      if (isFirebaseConfigured && user) {
        await api.delete(user.uid, id);
      } else {
        setItems((prev) => prev.filter((item) => item.id !== id));
      }
    },
    [user, isFirebaseConfigured]
  );

  const clearChecked = useCallback(async () => {
    const checked = items.filter((i) => i.checked);
    for (const item of checked) {
      if (isFirebaseConfigured && user) {
        await api.delete(user.uid, item.id);
      }
    }
    if (!isFirebaseConfigured) {
      setItems((prev) => prev.filter((i) => !i.checked));
    }
  }, [items, user, isFirebaseConfigured]);

  return { items, loading, addItem, updateItem, deleteItem, clearChecked };
}

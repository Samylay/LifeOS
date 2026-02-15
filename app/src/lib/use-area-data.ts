"use client";

import { useState, useEffect, useCallback } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import { useAuth } from "./auth-context";
import type { AreaId } from "./types";

/**
 * Generic hook for persisting area-specific widget data in Firestore.
 * Stores data as a single document per area at `users/{uid}/areaData/{areaId}`.
 * Falls back to local state when Firebase is not configured.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useAreaData<T extends Record<string, any>>(
  areaId: AreaId,
  defaultData: T
) {
  const { user, isFirebaseConfigured } = useAuth();
  const [data, setData] = useState<T>(defaultData);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isFirebaseConfigured || !user || !db) {
      setLoading(false);
      return;
    }

    const ref = doc(db, `users/${user.uid}/areaData`, areaId);
    const unsubscribe = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        setData({ ...defaultData, ...snap.data() } as T);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, [user, isFirebaseConfigured, areaId]);

  const updateData = useCallback(
    async (updates: Partial<T>) => {
      setData((prev) => ({ ...prev, ...updates }));

      if (isFirebaseConfigured && user && db) {
        const ref = doc(db, `users/${user.uid}/areaData`, areaId);
        await setDoc(ref, updates as Record<string, unknown>, { merge: true });
      }
    },
    [user, isFirebaseConfigured, areaId]
  );

  return { data, loading, updateData };
}

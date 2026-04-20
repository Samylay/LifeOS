"use client";

import { useState, useEffect } from "react";
import { collection, onSnapshot, query, orderBy, where, Timestamp, limit } from "firebase/firestore";
import { db } from "./firebase";
import type { FocusSession } from "./types";
import { useAuth } from "./auth-context";

export function useFocusSessions(days: number = 7) {
  const { user, isFirebaseConfigured } = useAuth();
  const [sessions, setSessions] = useState<FocusSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isFirebaseConfigured || !user || !db) {
      setLoading(false);
      return;
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    const q = query(
      collection(db, `users/${user.uid}/focusSessions`),
      where("startedAt", ">=", Timestamp.fromDate(startDate)),
      orderBy("startedAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const items = snap.docs.map((doc) => {
        const data = doc.data();
        return {
          ...data,
          id: doc.id,
          startedAt: data.startedAt?.toDate?.() || new Date(),
          endedAt: data.endedAt?.toDate?.() || undefined,
        } as FocusSession;
      });
      setSessions(items);
      setLoading(false);
    });

    return unsubscribe;
  }, [user, isFirebaseConfigured, days]);

  return { sessions, loading };
}

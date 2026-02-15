"use client";

import { useState, useEffect, useCallback } from "react";
import { doc, onSnapshot, Timestamp } from "firebase/firestore";
import { db, isConfigured } from "./firebase";
import { dailyLogs } from "./firestore";
import type { DailyLog } from "./types";
import { useAuth } from "./auth-context";

function getTodayKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

const DEFAULT_LOG: DailyLog = {
  date: getTodayKey(),
  focusSessions: 0,
  focusMinutes: 0,
  streakDay: 0,
};

export function useDailyLog() {
  const { user, isFirebaseConfigured } = useAuth();
  const [log, setLog] = useState<DailyLog>(DEFAULT_LOG);
  const [loading, setLoading] = useState(true);
  const todayKey = getTodayKey();

  useEffect(() => {
    if (!isFirebaseConfigured || !user || !db) {
      setLog({ ...DEFAULT_LOG, date: todayKey });
      setLoading(false);
      return;
    }

    const ref = doc(db, `users/${user.uid}/dailyLogs`, todayKey);
    const unsubscribe = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        setLog({ date: todayKey, ...snap.data() } as DailyLog);
      } else {
        setLog({ ...DEFAULT_LOG, date: todayKey });
      }
      setLoading(false);
    });

    return unsubscribe;
  }, [user, isFirebaseConfigured, todayKey]);

  const updateLog = useCallback(
    async (data: Partial<DailyLog>) => {
      if (isFirebaseConfigured && user) {
        await dailyLogs.set(user.uid, todayKey, data);
      } else {
        setLog((prev) => ({ ...prev, ...data }));
      }
    },
    [user, isFirebaseConfigured, todayKey]
  );

  return { log, loading, updateLog, todayKey };
}

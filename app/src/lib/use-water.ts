"use client";

import { useState, useEffect, useCallback } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import type { WaterLog } from "./types";
import { useAuth } from "./auth-context";

const DEFAULT_GOAL = 8; // 8 glasses (2L)

function todayKey() {
  return new Date().toISOString().split("T")[0];
}

function defaultLog(): WaterLog {
  return {
    date: todayKey(),
    glasses: 0,
    goal: DEFAULT_GOAL,
    entries: [],
  };
}

export function useWater() {
  const { user, isFirebaseConfigured } = useAuth();
  const [log, setLog] = useState<WaterLog>(defaultLog());
  const [loading, setLoading] = useState(true);

  const today = todayKey();

  useEffect(() => {
    if (!isFirebaseConfigured || !user || !db) {
      // Try load from localStorage
      try {
        const saved = localStorage.getItem(`water_${today}`);
        if (saved) setLog(JSON.parse(saved));
      } catch {}
      setLoading(false);
      return;
    }

    const docRef = doc(db, `users/${user.uid}/waterLogs`, today);
    const unsubscribe = onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        setLog({ ...defaultLog(), ...snap.data() } as WaterLog);
      } else {
        setLog(defaultLog());
      }
      setLoading(false);
    });

    return unsubscribe;
  }, [user, isFirebaseConfigured, today]);

  const saveLog = useCallback(
    async (updated: WaterLog) => {
      setLog(updated);
      if (isFirebaseConfigured && user && db) {
        await setDoc(
          doc(db, `users/${user.uid}/waterLogs`, today),
          updated,
          { merge: true }
        );
      } else {
        localStorage.setItem(`water_${today}`, JSON.stringify(updated));
      }
    },
    [user, isFirebaseConfigured, today]
  );

  const addGlass = useCallback(async () => {
    const now = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    const updated: WaterLog = {
      ...log,
      glasses: log.glasses + 1,
      entries: [...log.entries, { time: now, amount: 250 }],
    };
    await saveLog(updated);
  }, [log, saveLog]);

  const removeGlass = useCallback(async () => {
    if (log.glasses <= 0) return;
    const entries = [...log.entries];
    entries.pop();
    const updated: WaterLog = {
      ...log,
      glasses: log.glasses - 1,
      entries,
    };
    await saveLog(updated);
  }, [log, saveLog]);

  const setGoal = useCallback(
    async (goal: number) => {
      await saveLog({ ...log, goal });
    },
    [log, saveLog]
  );

  const percentage = Math.min(100, Math.round((log.glasses / log.goal) * 100));

  return {
    log,
    loading,
    addGlass,
    removeGlass,
    setGoal,
    percentage,
  };
}

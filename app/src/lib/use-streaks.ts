"use client";

import { useState, useEffect, useCallback } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";
import { streaks as streaksApi } from "./firestore";
import type { Streaks, StreakData } from "./types";
import { useAuth } from "./auth-context";

const DEFAULT_STREAK: StreakData = { current: 0, longest: 0, lastActiveDate: "" };

const DEFAULT_STREAKS: Streaks = {
  focus: { ...DEFAULT_STREAK },
  areas: {},
  shieldDaysUsed: 0,
};

function getTodayKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function getYesterdayKey(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function useStreaks() {
  const { user, isFirebaseConfigured } = useAuth();
  const [streaks, setStreaks] = useState<Streaks>(DEFAULT_STREAKS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isFirebaseConfigured || !user || !db) {
      setLoading(false);
      return;
    }

    const ref = doc(db, `users/${user.uid}/streaks/data`);
    const unsubscribe = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        setStreaks(snap.data() as Streaks);
      } else {
        setStreaks(DEFAULT_STREAKS);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, [user, isFirebaseConfigured]);

  const recordFocusDay = useCallback(async () => {
    const today = getTodayKey();
    const yesterday = getYesterdayKey();

    const current = streaks.focus;
    let newCurrent: number;

    if (current.lastActiveDate === today) {
      // Already recorded today
      return;
    } else if (current.lastActiveDate === yesterday) {
      // Consecutive day
      newCurrent = current.current + 1;
    } else {
      // Streak broken (or first day)
      newCurrent = 1;
    }

    const newStreak: StreakData = {
      current: newCurrent,
      longest: Math.max(current.longest, newCurrent),
      lastActiveDate: today,
    };

    const updated = { ...streaks, focus: newStreak };

    if (isFirebaseConfigured && user) {
      await streaksApi.set(user.uid, updated);
    } else {
      setStreaks(updated);
    }
  }, [streaks, user, isFirebaseConfigured]);

  return { streaks, loading, recordFocusDay };
}

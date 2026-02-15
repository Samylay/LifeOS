"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { collection, onSnapshot, query, orderBy, where, Timestamp } from "firebase/firestore";
import { db, isConfigured } from "./firebase";
import { focusSessions as sessionsApi } from "./firestore";
import type { FocusSession, FocusSessionType, FocusSessionStatus, AreaId } from "./types";
import { useAuth } from "./auth-context";

export type TimerState = "idle" | "running" | "paused";

export interface FocusTimerConfig {
  focusDuration: number; // minutes
  breakDuration: number;
  longBreakDuration: number;
  longBreakAfter: number; // sessions
}

export const DEFAULT_CONFIG: FocusTimerConfig = {
  focusDuration: 25,
  breakDuration: 5,
  longBreakDuration: 15,
  longBreakAfter: 4,
};

let localSessionId = 0;

export function useFocusTimer() {
  const { user, isFirebaseConfigured } = useAuth();
  const [config, setConfig] = useState<FocusTimerConfig>(DEFAULT_CONFIG);

  // Timer state
  const [timerState, setTimerState] = useState<TimerState>("idle");
  const [sessionType, setSessionType] = useState<FocusSessionType>("focus");
  const [timeRemaining, setTimeRemaining] = useState(config.focusDuration * 60);
  const [totalTime, setTotalTime] = useState(config.focusDuration * 60);
  const [completedSessions, setCompletedSessions] = useState(0);
  const [interruptions, setInterruptions] = useState(0);

  // Session context
  const [linkedArea, setLinkedArea] = useState<AreaId | undefined>();
  const [linkedTaskId, setLinkedTaskId] = useState<string | undefined>();

  // Active session tracking
  const sessionStartRef = useRef<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Use ref to avoid stale closures in the interval callback
  const handleCompleteRef = useRef<() => Promise<void>>(undefined);

  // Today's sessions
  const [todaySessions, setTodaySessions] = useState<FocusSession[]>([]);

  // Load today's sessions
  useEffect(() => {
    if (!isFirebaseConfigured || !user || !db) return;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const q = query(
      collection(db, `users/${user.uid}/focusSessions`),
      where("startedAt", ">=", Timestamp.fromDate(todayStart)),
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
      setTodaySessions(items);
    });

    return unsubscribe;
  }, [user, isFirebaseConfigured]);

  const handleSessionComplete = useCallback(async () => {
    setTimerState("idle");

    try {
      const audio = new Audio("data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbsGEcBj+a2teleR4DHZXQ0I9RA");
      audio.volume = 0.5;
      audio.play().catch(() => {});
    } catch {}

    if (sessionType === "focus") {
      const endedAt = new Date();
      const startedAt = sessionStartRef.current || new Date(endedAt.getTime() - config.focusDuration * 60 * 1000);
      const actualDuration = Math.round((endedAt.getTime() - startedAt.getTime()) / 60000);

      const sessionData: Omit<FocusSession, "id"> = {
        startedAt,
        endedAt,
        plannedDuration: config.focusDuration,
        actualDuration,
        type: "focus",
        status: "completed",
        area: linkedArea,
        taskId: linkedTaskId,
        interruptions,
      };

      if (isFirebaseConfigured && user) {
        await sessionsApi.create(user.uid, sessionData);
      } else {
        const local: FocusSession = { ...sessionData, id: `local-session-${++localSessionId}` };
        setTodaySessions((prev) => [local, ...prev]);
      }

      const newCompleted = completedSessions + 1;
      setCompletedSessions(newCompleted);
      setInterruptions(0);

      if (newCompleted % config.longBreakAfter === 0) {
        setSessionType("long_break");
        const dur = config.longBreakDuration * 60;
        setTimeRemaining(dur);
        setTotalTime(dur);
      } else {
        setSessionType("break");
        const dur = config.breakDuration * 60;
        setTimeRemaining(dur);
        setTotalTime(dur);
      }
    } else {
      setSessionType("focus");
      const dur = config.focusDuration * 60;
      setTimeRemaining(dur);
      setTotalTime(dur);
    }

    sessionStartRef.current = null;
  }, [sessionType, completedSessions, config, linkedArea, linkedTaskId, interruptions, user, isFirebaseConfigured]);

  // Keep the ref in sync with the latest handleSessionComplete
  useEffect(() => {
    handleCompleteRef.current = handleSessionComplete;
  }, [handleSessionComplete]);

  // Timer tick - uses ref to always call the latest handleSessionComplete
  useEffect(() => {
    if (timerState !== "running") {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    intervalRef.current = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          handleCompleteRef.current?.();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [timerState]);

  const getDurationForType = (type: FocusSessionType): number => {
    switch (type) {
      case "focus": return config.focusDuration * 60;
      case "break": return config.breakDuration * 60;
      case "long_break": return config.longBreakDuration * 60;
    }
  };

  const start = useCallback(() => {
    sessionStartRef.current = new Date();
    setTimerState("running");
  }, []);

  const pause = useCallback(() => {
    setTimerState("paused");
    if (sessionType === "focus") {
      setInterruptions((prev) => prev + 1);
    }
  }, [sessionType]);

  const resume = useCallback(() => {
    setTimerState("running");
  }, []);

  const stop = useCallback(async () => {
    if (sessionType === "focus" && sessionStartRef.current) {
      const endedAt = new Date();
      const startedAt = sessionStartRef.current;
      const actualDuration = Math.round((endedAt.getTime() - startedAt.getTime()) / 60000);
      const status: FocusSessionStatus = actualDuration >= config.focusDuration * 0.5 ? "partial" : "abandoned";

      const sessionData: Omit<FocusSession, "id"> = {
        startedAt,
        endedAt,
        plannedDuration: config.focusDuration,
        actualDuration,
        type: "focus",
        status,
        area: linkedArea,
        taskId: linkedTaskId,
        interruptions,
      };

      if (isFirebaseConfigured && user) {
        await sessionsApi.create(user.uid, sessionData);
      } else {
        const local: FocusSession = { ...sessionData, id: `local-session-${++localSessionId}` };
        setTodaySessions((prev) => [local, ...prev]);
      }
    }

    setTimerState("idle");
    setSessionType("focus");
    setTimeRemaining(config.focusDuration * 60);
    setTotalTime(config.focusDuration * 60);
    setInterruptions(0);
    sessionStartRef.current = null;
  }, [sessionType, config, linkedArea, linkedTaskId, interruptions, user, isFirebaseConfigured]);

  const skip = useCallback(() => {
    setTimerState("idle");
    setSessionType("focus");
    const dur = config.focusDuration * 60;
    setTimeRemaining(dur);
    setTotalTime(dur);
    sessionStartRef.current = null;
  }, [config]);

  // Apply new config (e.g., from focus blocks or settings)
  const applyConfig = useCallback((newConfig: Partial<FocusTimerConfig>) => {
    setConfig((prev) => {
      const updated = { ...prev, ...newConfig };
      // If idle, update the timer display too
      if (timerState === "idle") {
        const dur = updated.focusDuration * 60;
        setTimeRemaining(dur);
        setTotalTime(dur);
      }
      return updated;
    });
  }, [timerState]);

  const todayFocusMinutes = todaySessions
    .filter((s) => s.type === "focus" && s.status === "completed")
    .reduce((sum, s) => sum + (s.actualDuration || 0), 0);

  const todayCompletedSessions = todaySessions.filter(
    (s) => s.type === "focus" && s.status === "completed"
  ).length;

  return {
    timerState,
    sessionType,
    timeRemaining,
    totalTime,
    completedSessions,
    interruptions,

    linkedArea,
    setLinkedArea,
    linkedTaskId,
    setLinkedTaskId,

    start,
    pause,
    resume,
    stop,
    skip,
    applyConfig,

    todaySessions,
    todayFocusMinutes,
    todayCompletedSessions,

    config,
  };
}

"use client";

import { useState, useEffect, useCallback } from "react";
import { collection, onSnapshot, query, orderBy } from "@/lib/local-db";
import { db } from "./firebase";
import { strengthFocuses as api } from "./firestore";
import type { StrengthFocus } from "./types";
import { useAuth } from "./auth-context";

let localIdCounter = 0;

// Default focus queue, seeded on first run. Ordered: foundational work first,
// plyometrics on top of a built core, shoulders/back last. All in service of
// the run (Vichy 70.3).
const SEED_FOCUSES: Omit<StrengthFocus, "id" | "createdAt" | "updatedAt">[] = [
  {
    label: "Core & Balance",
    state: "building",
    order: 0,
    buildWeeks: 4,
    buildStarted: new Date(),
    buildTargetFreq: 4,
    maintainFreq: 1,
    exercises: [
      "Dead bug — 3×10/side",
      "Pallof press — 3×10/side",
      "Side plank — 3×30–45s/side",
      "Single-leg balance (eyes closed) — 3×30s/side",
      "Bird dog — 3×8/side",
    ],
    log: [],
  },
  {
    label: "Plyometrics",
    state: "queued",
    order: 1,
    buildWeeks: 4,
    buildTargetFreq: 3,
    maintainFreq: 1,
    exercises: ["Low pogo hops", "Bounding", "Box jumps (low)"],
    note: "Needs the core base; feeds run economy.",
    log: [],
  },
  {
    label: "Shoulders & Back",
    state: "queued",
    order: 2,
    buildWeeks: 4,
    buildTargetFreq: 3,
    maintainFreq: 1,
    exercises: ["Band pull-apart", "Scap pull-ups", "Face pulls", "Rows"],
    note: "Least time-sensitive; easy to maintain alongside other blocks.",
    log: [],
  },
];

export function useStrength() {
  const { user, isFirebaseConfigured } = useAuth();
  const [focuses, setFocuses] = useState<StrengthFocus[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isFirebaseConfigured || !user || !db) {
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, `users/${user.uid}/strengthFocuses`),
      orderBy("order", "asc")
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const data = snap.docs.map((doc) => {
        const d = doc.data();
        return {
          ...d,
          id: doc.id,
          buildStarted: d.buildStarted?.toDate?.() || undefined,
          createdAt: d.createdAt?.toDate?.() || new Date(),
          updatedAt: d.updatedAt?.toDate?.() || new Date(),
          log: (d.log || []).map((e: { date: { toDate?: () => Date } | Date }) => ({
            date: (e.date as { toDate?: () => Date })?.toDate?.() || new Date(e.date as Date),
          })),
        } as StrengthFocus;
      });
      setFocuses(data);
      setLoading(false);
    });

    return unsubscribe;
  }, [user, isFirebaseConfigured]);

  const createFocus = useCallback(
    async (data: Omit<StrengthFocus, "id" | "createdAt" | "updatedAt">) => {
      const now = new Date();
      if (isFirebaseConfigured && user) {
        return await api.create(user.uid, { ...data, createdAt: now, updatedAt: now });
      } else {
        const newFocus: StrengthFocus = {
          ...data,
          id: `local-strength-${++localIdCounter}`,
          createdAt: now,
          updatedAt: now,
        };
        setFocuses((prev) => [...prev, newFocus].sort((a, b) => a.order - b.order));
        return newFocus.id;
      }
    },
    [user, isFirebaseConfigured]
  );

  const updateFocus = useCallback(
    async (id: string, data: Partial<StrengthFocus>) => {
      const patch = { ...data, updatedAt: new Date() };
      if (isFirebaseConfigured && user) {
        await api.update(user.uid, id, patch);
      } else {
        setFocuses((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
      }
    },
    [user, isFirebaseConfigured]
  );

  const deleteFocus = useCallback(
    async (id: string) => {
      if (isFirebaseConfigured && user) {
        await api.delete(user.uid, id);
      } else {
        setFocuses((prev) => prev.filter((f) => f.id !== id));
      }
    },
    [user, isFirebaseConfigured]
  );

  // Append a dated session to a focus's log (optimistic; rewrites the array).
  const logSession = useCallback(
    async (id: string, date: Date = new Date()) => {
      const focus = focuses.find((f) => f.id === id);
      if (!focus) return;
      const log = [...focus.log, { date }];
      await updateFocus(id, { log });
    },
    [focuses, updateFocus]
  );

  const undoLastSession = useCallback(
    async (id: string) => {
      const focus = focuses.find((f) => f.id === id);
      if (!focus || focus.log.length === 0) return;
      await updateFocus(id, { log: focus.log.slice(0, -1) });
    },
    [focuses, updateFocus]
  );

  // Graduate: flip the given focus to maintaining and promote the
  // next-in-queue focus to building (starting its clock today).
  const graduate = useCallback(
    async (id: string) => {
      const focus = focuses.find((f) => f.id === id);
      if (!focus) return;
      await updateFocus(id, { state: "maintaining" });
      const next = focuses
        .filter((f) => f.state === "queued" && f.id !== id)
        .sort((a, b) => a.order - b.order)[0];
      if (next) {
        await updateFocus(next.id, { state: "building", buildStarted: new Date() });
      }
    },
    [focuses, updateFocus]
  );

  // One-time seed of the default queue.
  const seedDefaults = useCallback(async () => {
    for (const f of SEED_FOCUSES) {
      await createFocus(f);
    }
  }, [createFocus]);

  const building = focuses.find((f) => f.state === "building");
  const maintaining = focuses.filter((f) => f.state === "maintaining");
  const queued = focuses.filter((f) => f.state === "queued").sort((a, b) => a.order - b.order);

  return {
    focuses,
    loading,
    building,
    maintaining,
    queued,
    createFocus,
    updateFocus,
    deleteFocus,
    logSession,
    undoLastSession,
    graduate,
    seedDefaults,
  };
}

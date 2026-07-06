"use client";

import { useCallback } from "react";
import { useCollection } from "./use-collection";
import type { StrengthFocus } from "./types";

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

const FOCUS_DEFAULTS: Partial<StrengthFocus> = { log: [] };

export function useStrength() {
  const { items: focuses, loading, create, update, remove } =
    useCollection<StrengthFocus>("strengthFocuses", {
      orderByField: "order",
      orderDir: "asc",
      defaults: FOCUS_DEFAULTS,
    });

  const createFocus = useCallback(
    async (data: Omit<StrengthFocus, "id" | "createdAt" | "updatedAt">) => {
      const now = new Date();
      return await create({ ...data, createdAt: now, updatedAt: now });
    },
    [create]
  );

  const updateFocus = useCallback(
    async (id: string, data: Partial<StrengthFocus>) => {
      await update(id, { ...data, updatedAt: new Date() });
    },
    [update]
  );

  const deleteFocus = useCallback(async (id: string) => remove(id), [remove]);

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

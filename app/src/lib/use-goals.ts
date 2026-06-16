"use client";

import { useState, useEffect, useCallback } from "react";
import { collection, onSnapshot, query, orderBy } from "@/lib/local-db";
import { db } from "./firebase";
import { goals as api } from "./firestore";
import type { Goal, GoalCommitment } from "./types";
import { quarterOf, mondayOf } from "./types";
import { useAuth } from "./auth-context";

interface GoalDraftApplied {
  outcome: string;
  milestones: string[];
  added: number;
}

let localId = 0;
const cid = () => `c-${Date.now().toString(36)}-${++localId}`;

export function useGoals() {
  const { user, isFirebaseConfigured } = useAuth();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isFirebaseConfigured || !user || !db) {
      setLoading(false);
      return;
    }
    const q = query(
      collection(db, `users/${user.uid}/objectives`),
      orderBy("createdAt", "desc")
    );
    const unsub = onSnapshot(q, (snap) => {
      const items = snap.docs.map((doc) => {
        const d = doc.data();
        return {
          ...d,
          id: doc.id,
          milestones: d.milestones || [],
          commitments: d.commitments || [],
          sessions: d.sessions || [],
          createdAt: d.createdAt?.toDate?.() || new Date(),
          updatedAt: d.updatedAt?.toDate?.() || new Date(),
        } as Goal;
      });
      setGoals(items);
      setLoading(false);
    });
    return unsub;
  }, [user, isFirebaseConfigured]);

  const createGoal = useCallback(
    async (data: Pick<Goal, "title"> & Partial<Goal>) => {
      const now = new Date();
      const goal: Omit<Goal, "id"> = {
        title: data.title,
        quarter: data.quarter || quarterOf(),
        why: data.why,
        outcome: data.outcome,
        status: data.status || "active",
        milestones: data.milestones || [],
        commitments: data.commitments || [],
        sessions: data.sessions || [],
        createdAt: now,
        updatedAt: now,
      };
      if (isFirebaseConfigured && user) {
        return await api.create(user.uid, goal);
      }
      const local: Goal = { ...goal, id: `local-goal-${++localId}` };
      setGoals((prev) => [local, ...prev]);
      return local.id;
    },
    [user, isFirebaseConfigured]
  );

  const updateGoal = useCallback(
    async (id: string, data: Partial<Goal>) => {
      const patch = { ...data, updatedAt: new Date() };
      if (isFirebaseConfigured && user) {
        await api.update(user.uid, id, patch);
      } else {
        setGoals((prev) => prev.map((g) => (g.id === id ? { ...g, ...patch } : g)));
      }
    },
    [user, isFirebaseConfigured]
  );

  const deleteGoal = useCallback(
    async (id: string) => {
      if (isFirebaseConfigured && user) {
        await api.delete(user.uid, id);
      } else {
        setGoals((prev) => prev.filter((g) => g.id !== id));
      }
    },
    [user, isFirebaseConfigured]
  );

  // --- Commitments (weekly layer) ---

  const addCommitment = useCallback(
    async (id: string, text: string, weekOf: string = mondayOf()) => {
      const goal = goals.find((g) => g.id === id);
      if (!goal || !text.trim()) return;
      const next: GoalCommitment = { id: cid(), text: text.trim(), weekOf, done: false };
      await updateGoal(id, { commitments: [...goal.commitments, next] });
    },
    [goals, updateGoal]
  );

  const toggleCommitment = useCallback(
    async (id: string, commitmentId: string) => {
      const goal = goals.find((g) => g.id === id);
      if (!goal) return;
      await updateGoal(id, {
        commitments: goal.commitments.map((c) =>
          c.id === commitmentId ? { ...c, done: !c.done } : c
        ),
      });
    },
    [goals, updateGoal]
  );

  const removeCommitment = useCallback(
    async (id: string, commitmentId: string) => {
      const goal = goals.find((g) => g.id === id);
      if (!goal) return;
      await updateGoal(id, {
        commitments: goal.commitments.filter((c) => c.id !== commitmentId),
      });
    },
    [goals, updateGoal]
  );

  // --- Sessions (day-to-day layer) ---

  const logSession = useCallback(
    async (id: string, note?: string) => {
      const goal = goals.find((g) => g.id === id);
      if (!goal) return;
      const date = new Date().toISOString().split("T")[0];
      await updateGoal(id, { sessions: [...goal.sessions, { date, note }] });
    },
    [goals, updateGoal]
  );

  // --- AI prefill via claude -p ---

  const draftPlan = useCallback(
    async (id: string): Promise<GoalDraftApplied | null> => {
      const goal = goals.find((g) => g.id === id);
      if (!goal) return null;
      const res = await fetch("/api/goals/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: goal.title,
          quarter: goal.quarter,
          why: goal.why,
          outcome: goal.outcome,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "draft failed");
      }
      const { draft } = await res.json();
      const weekOf = mondayOf();
      const newCommitments: GoalCommitment[] = (draft.thisWeek || []).map((t: string) => ({
        id: cid(),
        text: t,
        weekOf,
        done: false,
      }));
      await updateGoal(id, {
        outcome: goal.outcome || draft.outcome,
        milestones: draft.milestones || [],
        commitments: [...goal.commitments, ...newCommitments],
      });
      return { outcome: draft.outcome, milestones: draft.milestones, added: newCommitments.length };
    },
    [goals, updateGoal]
  );

  const active = goals.filter((g) => g.status === "active");

  return {
    goals,
    active,
    loading,
    createGoal,
    updateGoal,
    deleteGoal,
    addCommitment,
    toggleCommitment,
    removeCommitment,
    logSession,
    draftPlan,
  };
}

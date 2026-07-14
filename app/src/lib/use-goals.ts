"use client";

import { useCallback } from "react";
import { useCollection } from "./use-collection";
import type { Goal, GoalCommitment } from "./types";
import { quarterOf, mondayOf } from "./types";

interface GoalDraftApplied {
  outcome: string;
  milestones: string[];
  added: number;
}

let localId = 0;
const cid = () => `c-${Date.now().toString(36)}-${++localId}`;

const GOAL_DEFAULTS: Partial<Goal> = {
  milestones: [],
  doneMilestones: [],
  commitments: [],
  sessions: [],
};

export function useGoals() {
  const { items: goals, loading, create, update, remove } = useCollection<Goal>(
    "objectives",
    { orderByField: "createdAt", orderDir: "desc", defaults: GOAL_DEFAULTS }
  );

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
        doneMilestones: data.doneMilestones || [],
        commitments: data.commitments || [],
        sessions: data.sessions || [],
        createdAt: now,
        updatedAt: now,
      };
      return await create(goal);
    },
    [create]
  );

  const updateGoal = useCallback(
    async (id: string, data: Partial<Goal>) => {
      await update(id, { ...data, updatedAt: new Date() });
    },
    [update]
  );

  const deleteGoal = useCallback(async (id: string) => remove(id), [remove]);

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

  // --- Milestones (quarter layer) ---

  const toggleMilestone = useCallback(
    async (id: string, text: string) => {
      const goal = goals.find((g) => g.id === id);
      if (!goal) return;
      const done = goal.doneMilestones ?? [];
      const next = done.includes(text)
        ? done.filter((m) => m !== text)
        : [...done, text];
      await updateGoal(id, { doneMilestones: next });
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
      const nextMilestones: string[] = draft.milestones || [];
      // Redrafting replaces the milestone list; keep only the done marks whose
      // text survived so completion doesn't silently point at gone milestones.
      const prunedDone = (goal.doneMilestones ?? []).filter((m) => nextMilestones.includes(m));
      await updateGoal(id, {
        outcome: goal.outcome || draft.outcome,
        milestones: nextMilestones,
        doneMilestones: prunedDone,
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
    toggleMilestone,
    logSession,
    draftPlan,
  };
}

"use client";

import { useCallback, useEffect, useRef } from "react";
import { useCollection } from "./use-collection";
import type { Goal, GoalCommitment } from "./types";
import { quarterOf, mondayOf } from "./types";

interface GoalDraftApplied {
  outcome: string;
  added: number;
}

let localId = 0;
const cid = () => `c-${Date.now().toString(36)}-${++localId}`;

const GOAL_DEFAULTS: Partial<Goal> = {
  commitments: [],
  sessions: [],
};

// T79: the milestones layer (deprecated `milestones`/`doneMilestones` on
// `Goal`, see types.ts) is gone from the UI and from AI drafting, but a goal
// doc written before this ships can still carry that text in local-db's
// schemaless JSON blob. Rather than touch that store directly, fold each
// legacy goal's milestone text into its `outcome` the first time it loads
// after this ships — same tolerant-read/self-heal spirit as `doneMilestones
// ?? []` used to be — then clear the legacy fields so this never re-fires.
// Nothing is lost; it just moves from a checklist to prose.
function legacyMilestonesText(goal: Goal): string | null {
  if (!goal.milestones || goal.milestones.length === 0) return null;
  const done = new Set(goal.doneMilestones ?? []);
  const lines = goal.milestones.map((m) => `- [${done.has(m) ? "x" : " "}] ${m}`);
  return ["Milestones (carried over from the removed milestones layer):", ...lines].join("\n");
}

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
        commitments: data.commitments || [],
        sessions: data.sessions || [],
        needsGrilling: data.needsGrilling,
        createdAt: now,
        updatedAt: now,
      };
      const id = await create(goal);
      // T27: a newly created goal flagged needsGrilling gets its ONE grilling
      // todo enqueued immediately, guarded by the same optimistic
      // grillingQueuedAt stamp. Fail soft — the goal stands either way.
      if (data.needsGrilling) {
        void (async () => {
          try {
            await update(id, { grillingQueuedAt: new Date().toISOString() });
          } catch {
            /* guard stamp is best-effort */
          }
          try {
            await fetch("/api/goals/grilling", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id, title: goal.title }),
            });
          } catch {
            /* fail soft — pending reminder remains visible in the goals UI */
          }
        })();
      }
      return id;
    },
    [create, update]
  );

  const updateGoal = useCallback(
    async (id: string, data: Partial<Goal>) => {
      await update(id, { ...data, updatedAt: new Date() });
    },
    [update]
  );

  // T27: flag a goal as needing a grilling session and enqueue the ONE
  // Todoist task via the server route (token lives server-side). The local
  // `grillingQueuedAt` stamp lands first — optimistic duplicate guard — and
  // a failed enqueue never blocks or reverts the goal write (fail soft; the
  // pending reminder just stays pending and the route can be re-hit).
  const toggleGrilling = useCallback(
    async (id: string) => {
      const goal = goals.find((g) => g.id === id);
      if (!goal) return;
      const nextNeeds = !goal.needsGrilling;
      if (nextNeeds && !goal.grillingQueuedAt) {
        await updateGoal(id, {
          needsGrilling: true,
          grillingQueuedAt: new Date().toISOString(),
        });
        try {
          await fetch("/api/goals/grilling", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: goal.id, title: goal.title }),
          });
        } catch {
          // fail soft — pending reminder remains visible in the goals UI
        }
      } else {
        await updateGoal(id, { needsGrilling: nextNeeds });
      }
    },
    [goals, updateGoal]
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

  // Sessions are no longer logged by hand — ships on a goal's projects ARE the
  // sessions (folded in via withShipActivity). Manual "Log session" rewarded
  // meta-work and was cut 2026-07-29.

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
        commitments: [...goal.commitments, ...newCommitments],
      });
      return { outcome: draft.outcome, added: newCommitments.length };
    },
    [goals, updateGoal]
  );

  // T79: one-time, self-healing migration for goals written before the
  // milestones layer was removed — see `legacyMilestonesText` above. Runs
  // for every goal on every load, but the per-id guard plus the fact that a
  // migrated goal no longer has `milestones` means it fires at most once per
  // goal, ever.
  const migratedIds = useRef(new Set<string>());
  useEffect(() => {
    for (const goal of goals) {
      if (migratedIds.current.has(goal.id)) continue;
      const legacyText = legacyMilestonesText(goal);
      if (!legacyText) continue;
      migratedIds.current.add(goal.id);
      void updateGoal(goal.id, {
        outcome: [goal.outcome?.trim(), legacyText].filter(Boolean).join("\n\n"),
        milestones: [],
        doneMilestones: [],
      });
    }
  }, [goals, updateGoal]);

  const active = goals.filter((g) => g.status === "active");

  return {
    goals,
    active,
    loading,
    createGoal,
    updateGoal,
    deleteGoal,
    toggleGrilling,
    addCommitment,
    toggleCommitment,
    removeCommitment,
    draftPlan,
  };
}

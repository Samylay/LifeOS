// The weekly filming plan: which content types to shoot this week, and the
// floor below which the bank must not be drained.
//
// Moved out of content-scripting.ts when the script generator was deleted
// (T-content-rework-01). It survives the house law untouched because it plans
// what to film and never writes a word — Samy's call, 2026-09-04.
import type { ContentIdea, ContentPillar } from "@/lib/types";

// --- Weekly batch plan (PILLARS cadence + bank floor) ------------------------

/** Unscripted-ideas floor (vault kill/scale rules): never let unscripted ideas drop below 12. */
export const BANK_FLOOR = 12;

/**
 * Weekly quota in KEEP priority order. Concept explainers (under-the-hood key)
 * are the channel core and are never cut first; the quick-win Gotcha demo is
 * the first to go when the bank floor bites.
 */
export const WEEKLY_SLOTS: ContentPillar[] = [
  "under-the-hood",
  "under-the-hood",
  "build-log",
  "workflow-win",
];

export interface BatchPlan {
  toGenerate: ContentIdea[];
  blocked: { pillar: ContentPillar; reason: string }[];
  unscripted: number; // ideas with status "idea" before generating
}

/**
 * Pick this week's batch from the bank: next unscripted idea per slot, in bank
 * order, hook formula required (an idea without one is a topic, not a post).
 * Respects the 12-idea floor — if generating the full batch would drain the
 * bank below it, only the safe count is generated (in keep-priority order)
 * and the rest is reported blocked.
 */
export function planWeeklyBatch(ideas: ContentIdea[]): BatchPlan {
  const unscripted = ideas.filter((i) => i.status === "idea").length;
  const picked: ContentIdea[] = [];
  const blocked: BatchPlan["blocked"] = [];

  for (const pillar of WEEKLY_SLOTS) {
    const candidate = ideas.find(
      (i) =>
        i.status === "idea" &&
        i.pillar === pillar &&
        !!i.hookFormula &&
        !picked.includes(i)
    );
    if (candidate) picked.push(candidate);
    else
      blocked.push({
        pillar,
        reason: `no unscripted ${pillar} idea with a hook formula in the bank`,
      });
  }

  const safe = Math.max(0, unscripted - BANK_FLOOR);
  const toGenerate = picked.slice(0, safe);
  for (const idea of picked.slice(safe)) {
    blocked.push({
      pillar: idea.pillar as ContentPillar, // picked ideas matched a WEEKLY_SLOTS pillar, so never ""
      reason: `bank floor: scripting "${idea.title}" would drop unscripted ideas below ${BANK_FLOOR} — bank more ideas first`,
    });
  }

  return { toGenerate, blocked, unscripted };
}

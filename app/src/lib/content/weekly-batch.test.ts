import { describe, it, expect } from "vitest";
import type { ContentIdea, ContentPillar, ContentIdeaStatus } from "@/lib/types";
import { planWeeklyBatch, BANK_FLOOR, WEEKLY_SLOTS } from "./weekly-batch";

// --- fixtures ----------------------------------------------------------------

let nextId = 0;
function idea(
  pillar: ContentPillar,
  overrides: Partial<ContentIdea> = {}
): ContentIdea {
  nextId += 1;
  return {
    id: `i${nextId}`,
    title: `Idea ${nextId}`,
    pillar,
    hookFormula: 3,
    status: "idea" as ContentIdeaStatus,
    createdAt: new Date(2026, 0, nextId), // bank order = creation order
    updatedAt: new Date(2026, 0, nextId),
    ...overrides,
  };
}

/** n unscripted ideas per pillar, in bank order BL → WW → UH. */
function bank(bl: number, ww: number, uh: number): ContentIdea[] {
  return [
    ...Array.from({ length: bl }, (_, i) => idea("build-log", { hookFormula: 4, episode: i + 1 })),
    ...Array.from({ length: ww }, () => idea("workflow-win", { hookFormula: 3 })),
    ...Array.from({ length: uh }, () => idea("under-the-hood", { hookFormula: 7 })),
  ];
}

// --- prompt construction -------------------------------------------------------

describe("planWeeklyBatch", () => {
  it("keeps the weekly quota: 2 concept (under-the-hood) + 1 built-it (build-log) + 1 workflow-win", () => {
    expect(WEEKLY_SLOTS.filter((p) => p === "under-the-hood")).toHaveLength(2);
    expect(WEEKLY_SLOTS.filter((p) => p === "build-log")).toHaveLength(1);
    expect(WEEKLY_SLOTS.filter((p) => p === "workflow-win")).toHaveLength(1);
  });

  it("picks the next unscripted idea per slot in bank order, well above the floor", () => {
    const ideas = bank(8, 6, 6); // 20 unscripted
    const plan = planWeeklyBatch(ideas);
    expect(plan.toGenerate).toHaveLength(4);
    expect(plan.blocked).toEqual([]);
    const pillars = plan.toGenerate.map((i) => i.pillar);
    expect(pillars).toEqual(["under-the-hood", "under-the-hood", "build-log", "workflow-win"]);
    // the Built-It pick is the next one in bank order
    const eps = plan.toGenerate.filter((i) => i.pillar === "build-log").map((i) => i.episode);
    expect(eps).toEqual([1]);
  });

  it("skips scripted/posted ideas and ideas without a hook formula", () => {
    const scripted = idea("workflow-win", { status: "scripted" });
    const noHook = idea("workflow-win", { hookFormula: undefined });
    const ready = idea("workflow-win");
    const ideas = [scripted, noHook, ready, ...bank(8, 4, 6)];
    const plan = planWeeklyBatch(ideas);
    const ww = plan.toGenerate.find((i) => i.pillar === "workflow-win");
    expect(ww?.id).toBe(ready.id);
  });

  it("reports a slot blocked when its pillar has no script-ready ideas", () => {
    const plan = planWeeklyBatch(bank(8, 0, 8)); // no workflow-win in the bank
    expect(plan.toGenerate.map((i) => i.pillar)).toEqual([
      "under-the-hood",
      "under-the-hood",
      "build-log",
    ]);
    expect(plan.blocked).toEqual([
      { pillar: "workflow-win", reason: expect.stringContaining("no unscripted workflow-win") },
    ]);
  });

  it("never drains the bank below the 12-idea floor: partial batch in keep-priority order", () => {
    // 14 unscripted → only 2 safe to script. Cut order: the quick-win demo
    // first, then the Built-It — never the Concept explainers (channel core).
    const plan = planWeeklyBatch(bank(6, 4, 4));
    expect(plan.unscripted).toBe(14);
    expect(plan.toGenerate.map((i) => i.pillar)).toEqual(["under-the-hood", "under-the-hood"]);
    const floorBlocked = plan.blocked.filter((b) => b.reason.includes("bank floor"));
    expect(floorBlocked.map((b) => b.pillar)).toEqual(["build-log", "workflow-win"]);
  });

  it("generates nothing at or below the floor", () => {
    const at = planWeeklyBatch(bank(4, 4, 4)); // exactly 12
    expect(at.toGenerate).toEqual([]);
    expect(at.blocked.filter((b) => b.reason.includes("bank floor"))).toHaveLength(4);

    const below = planWeeklyBatch(bank(2, 2, 2));
    expect(below.toGenerate).toEqual([]);
  });

  it("counts hook-less unscripted ideas toward the floor (they're still bank inventory)", () => {
    // 13 unscripted but one has no hook: still 1 safe slot.
    const ideas = [...bank(5, 4, 3), idea("workflow-win", { hookFormula: undefined })];
    const plan = planWeeklyBatch(ideas);
    expect(plan.unscripted).toBe(13);
    expect(plan.toGenerate).toHaveLength(13 - BANK_FLOOR);
    expect(plan.toGenerate[0].pillar).toBe("under-the-hood");
  });
});

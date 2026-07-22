import { describe, it, expect, vi } from "vitest";
import type { ContentIdea, ContentPillar, ContentIdeaStatus } from "./types";
import {
  buildScriptPrompt,
  normalizeHashtags,
  composeCaption,
  draftScriptForIdea,
  planWeeklyBatch,
  BANK_FLOOR,
  WEEKLY_SLOTS,
} from "./content-scripting";

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

describe("buildScriptPrompt", () => {
  it("embeds the Workflow Win skeleton with its word budget and beats", () => {
    const p = buildScriptPrompt({
      title: "Characterization tests first, then refactor",
      pillar: "workflow-win",
      hookFormula: 3,
    });
    expect(p).toContain("15–30s, ~65–80 words");
    expect(p).toContain("STAKES");
    expect(p).toContain("THE WORKFLOW — 3 steps max");
    expect(p).toContain("PROOF — the before/after number");
    // grounded in the actual hook formula template, not a description
    expect(p).toContain('Hook formula #3 — Time collapse: "This took me ___. Now it takes ___."');
    expect(p).toContain("Characterization tests first, then refactor");
  });

  it("embeds the Build Log skeleton, the episode number, and the serial CTA for n+1", () => {
    const p = buildScriptPrompt({
      title: "The agent deleted my test suite",
      pillar: "build-log",
      hookFormula: 4,
      episode: 7,
    });
    expect(p).toContain("30–60s, ~110–150 words");
    expect(p).toContain("SERIAL CTA");
    expect(p).toContain("Build Log episode number: 7");
    expect(p).toContain("tease Build Log 8");
    // Build Log lessons must survive without the product
    expect(p).toContain("never see his product");
  });

  it("embeds the carousel skeleton and asks for slide-per-line output", () => {
    const p = buildScriptPrompt({
      title: "RAG anatomy in 9 slides",
      pillar: "under-the-hood",
      hookFormula: 7,
    });
    expect(p).toContain("5–10 slides, ≤30 words per slide");
    expect(p).toContain("Slide 1: One hard claim");
    expect(p).toContain('"Slide N: <text>"');
  });

  it("carries the non-negotiables, including no tool names in the hook", () => {
    const p = buildScriptPrompt({ title: "x", pillar: "workflow-win", hookFormula: 1 });
    expect(p).toContain("Hooks never name-drop tools or model versions");
    expect(p).toContain("The hook must NOT contain any tool, product, or model name");
    expect(p).toContain("send test");
  });

  it("carries the anti-slop rules (stop-slop tells fail the draft)", () => {
    const p = buildScriptPrompt({ title: "x", pillar: "workflow-win", hookFormula: 1 });
    expect(p).toContain("Anti-slop rules (violating any of these fails the draft):");
    expect(p).toContain("isn't X, it's Y");
    expect(p).toContain("No em dashes in spoken lines or captions");
    expect(p).toContain("No filler adverbs");
    expect(p).toContain("No enumeration scaffolding in spoken lines");
  });

  it("carries the spoken-register rules", () => {
    const p = buildScriptPrompt({ title: "x", pillar: "workflow-win", hookFormula: 1 });
    expect(p).toContain("Spoken register (the script is read aloud):");
    expect(p).toContain("Contractions always");
    expect(p).toContain("survive being said aloud in one breath");
  });

  it("includes idea notes when present and rejects unknown hook formulas", () => {
    const p = buildScriptPrompt({
      title: "x",
      pillar: "workflow-win",
      hookFormula: 10,
      notes: "show the prompt snippet on screen",
    });
    expect(p).toContain("show the prompt snippet on screen");
    expect(() => buildScriptPrompt({ title: "x", pillar: "workflow-win", hookFormula: 99 })).toThrow(
      /unknown hook formula/
    );
  });
});

// --- caption / hashtag formatting ---------------------------------------------

describe("normalizeHashtags", () => {
  it("puts the keyword-verbatim tag first, always includes buildinpublic, prefixes #", () => {
    expect(normalizeHashtags(["cursortips", "devworkflow"], "AI code refactoring")).toEqual([
      "#aicoderefactoring",
      "#cursortips",
      "#devworkflow",
      "#buildinpublic",
    ]);
  });

  it("dedupes, strips stray # and spacing, caps at 5", () => {
    const tags = normalizeHashtags(
      ["#DevWorkflow", "devworkflow", "ai agents", "promptengineering", "codereview", "extra"],
      "dev workflow"
    );
    expect(tags).toHaveLength(5);
    expect(tags[0]).toBe("#devworkflow");
    expect(new Set(tags).size).toBe(5);
  });

  it("drops broad bait tags (#fyp is dead weight) and pads to the floor of 3", () => {
    const tags = normalizeHashtags(["fyp", "viral"], undefined);
    expect(tags).not.toContain("#fyp");
    expect(tags).not.toContain("#viral");
    expect(tags.length).toBeGreaterThanOrEqual(3);
    expect(tags).toContain("#buildinpublic");
  });
});

describe("composeCaption", () => {
  it("joins caption text and the hashtag row with a blank line", () => {
    expect(composeCaption("Line 1\nContext.\nSave this.", ["#a", "#b"])).toBe(
      "Line 1\nContext.\nSave this.\n\n#a #b"
    );
  });
});

// --- generation (model call mocked) ---------------------------------------------

describe("draftScriptForIdea", () => {
  const wwIdea = { title: "One rule fixed my output", pillar: "workflow-win" as const, hookFormula: 10 };

  it("sends the built prompt and returns script + composed caption", async () => {
    const generate = vi.fn().mockResolvedValue({
      hook: "One rule fixed 80% of my AI's garbage output.",
      script: "One rule fixed 80% of my AI's garbage output.\n\nStakes...\nWorkflow...\nProof...\nSave this.",
      caption: "One prompt rule that fixes vague AI output — make it ask 3 questions first.",
      keyword: "ai prompt rule",
      hashtags: ["promptengineering", "aiworkflow"],
    });
    const draft = await draftScriptForIdea(wwIdea, generate);
    expect(generate).toHaveBeenCalledWith(buildScriptPrompt(wwIdea));
    expect(draft.script).toMatch(/^One rule fixed 80%/);
    expect(draft.caption).toBe(
      "One prompt rule that fixes vague AI output — make it ask 3 questions first.\n\n#aipromptrule #promptengineering #aiworkflow #buildinpublic"
    );
  });

  it("prepends the hook when the model left it out of the script", async () => {
    const generate = vi.fn().mockResolvedValue({
      hook: "THE HOOK LINE",
      script: "Body without the hook.",
      caption: "cap",
      hashtags: ["a", "b", "c"],
    });
    const draft = await draftScriptForIdea(wwIdea, generate);
    expect(draft.script).toBe("THE HOOK LINE\n\nBody without the hook.");
  });

  it("throws when the model returns no script", async () => {
    const generate = vi.fn().mockResolvedValue({ caption: "cap" });
    await expect(draftScriptForIdea(wwIdea, generate)).rejects.toThrow(/no script/);
  });
});

// --- weekly batch plan -----------------------------------------------------------

describe("planWeeklyBatch", () => {
  it("keeps the weekly quota: 2 build-log + 1 workflow-win + 1 under-the-hood", () => {
    expect(WEEKLY_SLOTS.filter((p) => p === "build-log")).toHaveLength(2);
    expect(WEEKLY_SLOTS.filter((p) => p === "workflow-win")).toHaveLength(1);
    expect(WEEKLY_SLOTS.filter((p) => p === "under-the-hood")).toHaveLength(1);
  });

  it("picks the next unscripted idea per slot in bank order, well above the floor", () => {
    const ideas = bank(8, 6, 6); // 20 unscripted
    const plan = planWeeklyBatch(ideas);
    expect(plan.toGenerate).toHaveLength(4);
    expect(plan.blocked).toEqual([]);
    const pillars = plan.toGenerate.map((i) => i.pillar);
    expect(pillars).toEqual(["workflow-win", "build-log", "build-log", "under-the-hood"]);
    // the two Build Logs are the next episodes in bank order
    const eps = plan.toGenerate.filter((i) => i.pillar === "build-log").map((i) => i.episode);
    expect(eps).toEqual([1, 2]);
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
      "build-log",
      "build-log",
      "under-the-hood",
    ]);
    expect(plan.blocked).toEqual([
      { pillar: "workflow-win", reason: expect.stringContaining("no unscripted workflow-win") },
    ]);
  });

  it("never drains the bank below the 12-idea floor: partial batch in keep-priority order", () => {
    // 14 unscripted → only 2 safe to script. Cut order per 02: carousel first,
    // then one Build Log — never the Workflow Win.
    const plan = planWeeklyBatch(bank(6, 4, 4));
    expect(plan.unscripted).toBe(14);
    expect(plan.toGenerate.map((i) => i.pillar)).toEqual(["workflow-win", "build-log"]);
    const floorBlocked = plan.blocked.filter((b) => b.reason.includes("bank floor"));
    expect(floorBlocked.map((b) => b.pillar)).toEqual(["build-log", "under-the-hood"]);
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
    expect(plan.toGenerate[0].pillar).toBe("workflow-win");
  });
});

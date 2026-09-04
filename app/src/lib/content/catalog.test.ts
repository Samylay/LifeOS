import { describe, it, expect } from "vitest";
import {
  UNSORTED,
  countByType,
  resolveType,
  seedContentTypes,
  seedHookFormulas,
  sortTypes,
  typeLabel,
} from "./catalog";
import { PILLARS, HOOK_FORMULAS } from "@/lib/content-os";

describe("seeding — a change of custody, not of content", () => {
  const seeded = seedContentTypes();

  it("PILLAR KEYS SURVIVE VERBATIM", () => {
    // Load-bearing: weekly-batch.ts, its tests and the scheduler are wired to
    // these strings, and 18 live ideas reference them. A migration that
    // changes a key silently orphans the bank.
    expect(seeded.map((t) => t.key)).toEqual(["under-the-hood", "build-log", "workflow-win"]);
  });

  it("seeds today's labels and meanings, not new ones", () => {
    expect(seeded.map((t) => t.label)).toEqual(["Concept", "Built It", "Gotcha"]);
    for (const p of PILLARS) {
      const t = seeded.find((x) => x.key === p.pillar)!;
      expect(t.job).toBe(p.job);
      expect(t.short).toBe(p.short);
      expect(t.color).toBe(p.color);
    }
  });

  it("seeds every existing hook formula", () => {
    const hooks = seedHookFormulas();
    // The spec said nine; there are twelve live. Seed what exists.
    expect(hooks).toHaveLength(HOOK_FORMULAS.length);
    expect(hooks.map((h) => h.n)).toEqual(HOOK_FORMULAS.map((h) => h.n));
    expect(hooks[0].template).toBe(HOOK_FORMULAS[0].template);
  });

  it("starts populated, so the catalog is never an empty page", () => {
    expect(seeded.length).toBeGreaterThan(0);
    expect(seedHookFormulas().length).toBeGreaterThan(0);
  });
});

describe("resolving a type — losing a label never loses an idea", () => {
  const types = seedContentTypes();

  it("resolves every key the 18 live ideas use", () => {
    for (const key of ["under-the-hood", "build-log", "workflow-win"]) {
      expect(resolveType(key, types)).not.toBeNull();
    }
  });

  it("an untyped idea reads as Unsorted, not as broken", () => {
    expect(resolveType(UNSORTED, types)).toBeNull();
    expect(typeLabel(UNSORTED, types)).toBe("Unsorted");
    expect(typeLabel(undefined, types)).toBe("Unsorted");
  });

  it("an unknown key falls back to showing the key itself", () => {
    expect(typeLabel("retired-pillar", types)).toBe("retired-pillar");
  });

  it("sorts by explicit order, stable on ties", () => {
    const shuffled = [types[2], types[0], types[1]];
    expect(sortTypes(shuffled).map((t) => t.key)).toEqual(types.map((t) => t.key));
  });
});

describe("countByType — where the channel is thin", () => {
  const types = seedContentTypes();

  it("counts the live bank shape: 12 / 3 / 3", () => {
    const ideas = [
      ...Array(12).fill({ pillar: "under-the-hood" }),
      ...Array(3).fill({ pillar: "build-log" }),
      ...Array(3).fill({ pillar: "workflow-win" }),
    ];
    expect(countByType(ideas, types)).toEqual([
      { key: "under-the-hood", label: "Concept", count: 12 },
      { key: "build-log", label: "Built It", count: 3 },
      { key: "workflow-win", label: "Gotcha", count: 3 },
    ]);
  });

  it("shows a type with no ideas, because a thin area is the point", () => {
    const counts = countByType([{ pillar: "build-log" }], types);
    expect(counts.find((c) => c.key === "under-the-hood")?.count).toBe(0);
  });

  it("surfaces unsorted ideas only when there are some", () => {
    expect(countByType([{ pillar: "build-log" }], types).some((c) => c.key === UNSORTED)).toBe(false);
    // /decide files idea-bank cards with pillar: "" — this path is live.
    const withUnsorted = countByType([{ pillar: "" }, { pillar: "build-log" }], types);
    expect(withUnsorted.find((c) => c.key === UNSORTED)).toEqual({
      key: "", label: "Unsorted", count: 1,
    });
  });

  it("never drops an idea whose type is not in the catalog", () => {
    const counts = countByType([{ pillar: "retired-pillar" }], types);
    expect(counts.find((c) => c.key === "retired-pillar")?.count).toBe(1);
  });

  it("every idea is counted exactly once", () => {
    const ideas = [
      { pillar: "under-the-hood" }, { pillar: "" }, { pillar: "retired" },
      { pillar: "build-log" }, {},
    ];
    const total = countByType(ideas, types).reduce((n, c) => n + c.count, 0);
    expect(total).toBe(ideas.length);
  });
});

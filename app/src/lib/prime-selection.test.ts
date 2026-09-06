// prime-rework ticket 01. No fixture below is live content — the live bank
// (5 affirmations, 1 principle, seeded 2026-06-20, verified 2026-09-06) is
// read by the caller at runtime; this file uses invented placeholder text
// only to exercise the selection logic in isolation.
import { describe, it, expect, expectTypeOf } from "vitest";
import { primeFor, type PrimeBank, type PrimeSelection } from "./prime-selection";

function bank(overrides: Partial<PrimeBank> = {}): PrimeBank {
  return {
    affirmations: [
      { text: "anchor one", type: "anchor", active: true },
      { text: "anchor two", type: "anchor", active: true },
      { text: "rotating one", type: "rotating", active: true },
      { text: "rotating two", type: "rotating", active: true },
      { text: "rotating three", type: "rotating", active: true },
      { text: "contextual one", type: "contextual", active: true },
      { text: "inactive rotating", type: "rotating", active: false },
      { text: "inactive anchor", type: "anchor", active: false },
    ],
    principles: [{ text: "principle one", active: true }],
    ...overrides,
  };
}

describe("primeFor: determinism", () => {
  it("returns identical text for the same date and bank, called twice", () => {
    const b = bank();
    expect(primeFor("2026-09-07", b)).toEqual(primeFor("2026-09-07", b));
  });

  it("returns identical text for the same date across separately-constructed banks (simulated restart)", () => {
    // A freshly-read bank (e.g. after a process restart) is a new object with
    // the same content — determinism must not depend on object identity or
    // any in-memory cache.
    expect(primeFor("2026-09-07", bank())).toEqual(primeFor("2026-09-07", bank()));
  });

  it("is a pure function of its inputs — calling it many times never drifts", () => {
    const b = bank();
    const first = primeFor("2026-01-15", b);
    for (let i = 0; i < 20; i++) {
      expect(primeFor("2026-01-15", b)).toEqual(first);
    }
  });
});

describe("primeFor: anchors", () => {
  it("includes every active anchor for every date", () => {
    const b = bank();
    const expectedAnchors = ["anchor one", "anchor two"];
    for (const date of ["2026-01-01", "2026-06-20", "2026-12-31", "2027-03-14"]) {
      expect(primeFor(date, b).anchors).toEqual(expectedAnchors);
    }
  });

  it("never includes an inactive anchor", () => {
    expect(primeFor("2026-09-07", bank()).anchors).not.toContain("inactive anchor");
  });
});

describe("primeFor: rotating selection cycles fairly", () => {
  it("changes from one day to the next", () => {
    const b = bank();
    const days = Array.from({ length: 10 }, (_, i) => primeFor(`2026-09-${String(i + 1).padStart(2, "0")}`, b).rotating);
    const distinctSelections = new Set(days.map((r) => r.join("|")));
    expect(distinctSelections.size).toBeGreaterThan(1);
  });

  it("every active rotating item appears across a full cycle, none dominates and none starves", () => {
    const b = bank();
    const pool = ["rotating one", "rotating two", "rotating three", "contextual one"];
    const counts = new Map(pool.map((t) => [t, 0]));
    const cycleLength = pool.length;
    // Walk exactly one full cycle of consecutive day indices.
    for (let i = 0; i < cycleLength; i++) {
      const { rotating } = primeFor(`2026-09-${String(i + 1).padStart(2, "0")}`, b);
      for (const text of rotating) counts.set(text, (counts.get(text) ?? 0) + 1);
    }
    // 2 slots x 4-item pool over one 4-day cycle = 8 appearances, spread
    // exactly evenly (2 each) by the circular round-robin.
    for (const text of pool) {
      expect(counts.get(text)).toBe(2);
    }
  });

  it("never repeats the same rotating item twice within a single day's selection", () => {
    const b = bank();
    for (let i = 0; i < 30; i++) {
      const { rotating } = primeFor(`2026-0${(i % 9) + 1}-01`, b);
      expect(new Set(rotating).size).toBe(rotating.length);
    }
  });

  it("never includes an inactive rotating item", () => {
    for (let i = 0; i < 10; i++) {
      const { rotating } = primeFor(`2026-09-${String(i + 1).padStart(2, "0")}`, bank());
      expect(rotating).not.toContain("inactive rotating");
    }
  });
});

describe("primeFor: principle rotation", () => {
  it("surfaces the single active principle when there is only one", () => {
    expect(primeFor("2026-09-07", bank()).principle).toBe("principle one");
  });

  it("cycles fairly across multiple active principles the same way rotating affirmations do", () => {
    const b = bank({
      principles: [
        { text: "principle a", active: true },
        { text: "principle b", active: true },
        { text: "principle c", active: true },
      ],
    });
    const counts = new Map<string, number>();
    for (let i = 0; i < 3; i++) {
      const p = primeFor(`2026-09-0${i + 1}`, b).principle;
      if (p) counts.set(p, (counts.get(p) ?? 0) + 1);
    }
    expect([...counts.values()]).toEqual([1, 1, 1]);
  });
});

describe("primeFor: empty and small banks", () => {
  it("returns no text and does not throw for a completely empty bank", () => {
    const empty: PrimeBank = { affirmations: [], principles: [] };
    expect(() => primeFor("2026-09-07", empty)).not.toThrow();
    const result = primeFor("2026-09-07", empty);
    expect(result).toEqual({ date: "2026-09-07", anchors: [], rotating: [], principle: undefined });
  });

  it("still returns a valid result when there are fewer rotating items than the day's slot count", () => {
    const oneRotating = bank({
      affirmations: [
        { text: "anchor one", type: "anchor", active: true },
        { text: "only rotating", type: "rotating", active: true },
      ],
    });
    const result = primeFor("2026-09-07", oneRotating);
    expect(result.rotating).toEqual(["only rotating"]);
  });

  it("handles zero active principles by omitting the field rather than erroring", () => {
    const noPrinciple = bank({ principles: [{ text: "retired", active: false }] });
    expect(primeFor("2026-09-07", noPrinciple).principle).toBeUndefined();
  });
});

describe("primeFor: the live bank as it actually stands (no re-seeding)", () => {
  // Live-shape check only — 5 affirmations, 1 principle, per the 2026-09-06
  // verification. Content itself is never inlined here (it lives in the doc
  // store, not in code or a test fixture, per the constitution).
  it("does not require 12 items — fewer active items still produces a full result", () => {
    const liveShaped: PrimeBank = {
      affirmations: [
        { text: "a1", type: "anchor", active: true },
        { text: "a2", type: "anchor", active: true },
        { text: "r1", type: "rotating", active: true },
        { text: "r2", type: "rotating", active: true },
        { text: "r3", type: "rotating", active: true },
      ],
      principles: [{ text: "p1", active: true }],
    };
    const result = primeFor("2026-09-07", liveShaped);
    expect(result.anchors).toHaveLength(2);
    expect(result.rotating.length).toBeGreaterThan(0);
    expect(result.principle).toBe("p1");
  });
});

describe("structural: no completion state can exist on the returned shape", () => {
  // This is the test the ticket calls out by name: it must fail the moment
  // anyone adds a completion, acknowledgement, streak, or "done today" field
  // to PrimeSelection — because that is precisely the shape that produced
  // 10 sessions and 0 completions (see .scratch/prime-rework/spec.md).

  it("PrimeSelection has exactly this key set at compile time — no more, no less", () => {
    // expectTypeOf's toEqualTypeOf is a two-way structural match: adding an
    // optional field like `completedAt?` or `acknowledged?` to the
    // PrimeSelection interface makes this fail `tsc --noEmit`, even though
    // no test ever constructs such a value at runtime.
    expectTypeOf<PrimeSelection>().toEqualTypeOf<{
      date: string;
      anchors: string[];
      rotating: string[];
      principle?: string;
    }>();
  });

  it("a real result carries only the allowed keys at runtime", () => {
    const result = primeFor("2026-09-07", bank());
    const allowed = new Set(["date", "anchors", "rotating", "principle"]);
    for (const key of Object.keys(result)) {
      expect(allowed.has(key)).toBe(true);
    }
  });

  it("has no field whose name suggests session, completion, or streak state", () => {
    const result = primeFor("2026-09-07", bank());
    const forbidden = /complet|acknowledg|streak|done|session|start|skip|missed/i;
    for (const key of Object.keys(result)) {
      expect(key).not.toMatch(forbidden);
    }
  });
});

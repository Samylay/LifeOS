// today-brief-rework 01: the registry IS the card set. This test is the
// contract — a built brief contains exactly these ids, in this order, and
// none of the cards the rework dropped. Add or remove a card by editing
// registry.ts; this test fails the moment a removed card creeps back in.
import { describe, it, expect } from "vitest";
import { REGISTRY } from "./registry";

const SURVIVING_IDS = ["planning", "work", "triage", "fuite", "ft_headlines", "quorky_digest"];

// Removed on Samy's call (2026-09-06): ships (data source destroyed by the
// /projects rework), workout and objectives (dropped), prompt (superseded by
// /prime), homelab (relocated to /status).
const REMOVED_IDS = ["ships", "workout", "prompt", "objectives", "homelab"];

describe("brief registry", () => {
  it("contains exactly the surviving card ids, in the fixed order: plan, work, triage, then digest", () => {
    expect(REGISTRY.map((r) => r.meta.id)).toEqual(SURVIVING_IDS);
  });

  it("never re-registers a removed card", () => {
    const ids = REGISTRY.map((r) => r.meta.id);
    for (const removed of REMOVED_IDS) {
      expect(ids).not.toContain(removed);
    }
  });
});

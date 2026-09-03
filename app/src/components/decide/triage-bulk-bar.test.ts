import { describe, it, expect } from "vitest";
import { bulkTarget } from "./triage-bulk-bar";
import type { Action } from "@/lib/decide/actions";

const VAULT: Action = { id: "file-vault", params: {} };
const DISCARD: Action = { id: "discard", params: {} };
const SWE: Action = { id: "file-backlog", params: { centre: "swe-learning" } };
const POLY: Action = { id: "file-backlog", params: { centre: "polymath" } };

const deck = (...actions: (Action | null)[]) => ({
  items: actions.map((_, i) => ({ id: `i${i}` })),
  actionFor: (item: { id: string }) => actions[Number(item.id.slice(1))],
});

describe("bulkTarget — the run sharing the top card's action", () => {
  it("groups every card matching the top card, not just the leading run", () => {
    const { items, actionFor } = deck(VAULT, DISCARD, VAULT, VAULT);
    const t = bulkTarget(items, actionFor);
    expect(t?.action).toEqual(VAULT);
    expect(t?.items.map((i) => i.id)).toEqual(["i0", "i2", "i3"]);
  });

  it("offers nothing when the top card stands alone", () => {
    const { items, actionFor } = deck(VAULT, DISCARD, DISCARD);
    expect(bulkTarget(items, actionFor)).toBeNull();
  });

  it("treats two backlog centres as different actions", () => {
    const { items, actionFor } = deck(SWE, POLY, SWE);
    const t = bulkTarget(items, actionFor);
    expect(t?.action).toEqual(SWE);
    expect(t?.items.map((i) => i.id)).toEqual(["i0", "i2"]);
  });

  it("offers nothing for an empty deck or an undecidable top card", () => {
    expect(bulkTarget([], () => VAULT)).toBeNull();
    const { items, actionFor } = deck(null, VAULT, VAULT);
    expect(bulkTarget(items, actionFor)).toBeNull();
  });

  it("skips undecidable cards inside the batch", () => {
    const { items, actionFor } = deck(VAULT, null, VAULT);
    expect(bulkTarget(items, actionFor)?.items.map((i) => i.id)).toEqual(["i0", "i2"]);
  });
});

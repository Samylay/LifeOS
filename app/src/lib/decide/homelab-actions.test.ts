import { describe, expect, it } from "vitest";
import { actionLabel, isPerformable, parseDecideAction, proposedAction, selectableDecideActions } from "./homelab-actions";
import { proposedAction as proposedFilingAction } from "./actions";

describe("automatic UI reference recommendations", () => {
  it("offers the classified action as selected and submits the existing save action", () => {
    const item = { url: "https://example.com/components", proposal: { destination: "homelab-reference" } };
    const action = proposedAction(item)!;
    expect(action).toEqual({ id: "homelab-reference", params: {} });
    expect(actionLabel(action)).toBe("Save UI reference");
    expect(isPerformable(action)).toBe(true);
    expect(selectableDecideActions(item, action).filter((a) => a.id === action.id)).toEqual([action]);
    expect(parseDecideAction({ action: action.id, params: { command: "untrusted", url: "file:///secret" } })).toEqual(action);
  });

  it.each([undefined, "voice:123", "javascript:alert(1)", "not a URL", "https://user:secret@example.com"])(
    "does not propose a save with unusable source %s", (url) => {
      expect(proposedAction({ url, proposal: { destination: "homelab-reference" } })).toBeNull();
    },
  );

  it.each(["homelab-skill", "homelab-reference:run", "homelab-reference\nrun command"])(
    "does not expand the automatic action set for %s", (destination) => {
      expect(proposedAction({ url: "https://example.com", proposal: { destination } })).toBeNull();
    },
  );

  it.each(["vault", "idea-bank", "backlog:swe-learning", "discard", "roadmap:lifeos", "unknown"])(
    "preserves the existing mapping for %s", (destination) => {
      const item = { url: "https://example.com", proposal: { destination } };
      expect(proposedAction(item)).toEqual(proposedFilingAction(item));
    },
  );

  it("does not reclassify older cards from words in their summary", () => {
    expect(proposedAction({ url: "https://example.com", proposal: { destination: "vault", summary: "React UI component library" } }))
      .toEqual({ id: "file-vault", params: {} });
  });
});

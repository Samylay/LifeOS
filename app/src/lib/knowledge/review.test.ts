import { describe, it, expect } from "vitest";
import {
  INTERVALS_DAYS,
  dueCards,
  isDue,
  nextInterval,
  type SavedItem,
  type ReviewRecord,
  type ReviewState,
  type ReviewCard,
} from "./review";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-09-06T12:00:00.000Z").getTime();

function item(overrides: Partial<SavedItem> = {}): SavedItem {
  return {
    id: "item-1",
    title: "A Good Post",
    url: "https://example.com/a-good-post",
    text: "The quick brown fox jumps over the lazy dog.",
    passage: { start: 4, end: 15 }, // "quick brown"
    ...overrides,
  };
}

function record(overrides: Partial<ReviewRecord> = {}): ReviewRecord {
  return {
    sourceItemId: "item-1",
    dismissed: false,
    lastShownAt: null,
    intervalIndex: 0,
    ...overrides,
  };
}

describe("dueCards — provenance is structural, not conventional", () => {
  it("every card names the saved item it came from, and that item exists in the input", () => {
    const items = [item({ id: "a" }), item({ id: "b" })];
    const cards = dueCards(items, [], NOW);
    expect(cards.map((c) => c.sourceItemId).sort()).toEqual(["a", "b"]);
    for (const c of cards) {
      expect(items.some((i) => i.id === c.sourceItemId)).toBe(true);
    }
  });

  // The type itself is the enforcement: ReviewCard.sourceItemId is a required
  // string, so no object literal can satisfy the type without it. This is
  // caught by `tsc --noEmit`, not by a runtime assertion — the omission never
  // reaches a running program in the first place.
  it("a card cannot be represented without a source item id — caught at compile time", () => {
    // @ts-expect-error — sourceItemId is required; this line must fail to typecheck.
    const bad: ReviewCard = {
      quote: "x",
      start: 0,
      end: 1,
      attribution: { title: "t", url: "u" },
    };
    expect(bad).toBeDefined(); // never reached if the line above is removed and still typechecks
  });
});

describe("dueCards — a saved item that has never been shown is due immediately", () => {
  it("with no review state at all, a fresh item is due", () => {
    const cards = dueCards([item()], [], NOW);
    expect(cards).toHaveLength(1);
    expect(cards[0].sourceItemId).toBe("item-1");
  });

  it("with a review record that has never shown it (lastShownAt null), it is still due", () => {
    const cards = dueCards([item()], [record({ lastShownAt: null })], NOW);
    expect(cards).toHaveLength(1);
  });
});

describe("dueCards — extraction is verbatim, never generated", () => {
  it("a card's quote is an exact substring of its source text at the recorded offsets", () => {
    const src = item({ text: "Attention is all you need.", passage: { start: 0, end: 9 } });
    const [card] = dueCards([src], [], NOW);
    expect(card.quote).toBe("Attention");
    expect(card.start).toBe(0);
    expect(card.end).toBe(9);
    expect(src.text.slice(card.start, card.end)).toBe(card.quote);
  });

  it("carries the item's attribution verbatim", () => {
    const src = item({ title: "The Bitter Lesson", url: "https://example.com/bitter-lesson" });
    const [card] = dueCards([src], [], NOW);
    expect(card.attribution).toEqual({
      title: "The Bitter Lesson",
      url: "https://example.com/bitter-lesson",
    });
  });
});

describe("dueCards — nothing due returns nothing", () => {
  it("an item shown moments ago, on its first rung, is not due yet", () => {
    const cards = dueCards(
      [item()],
      [record({ lastShownAt: NOW - 1000, intervalIndex: 0 })],
      NOW
    );
    // Not filler, not a placeholder — an actual empty array.
    expect(cards).toEqual([]);
  });

  it("no saved items at all is an empty result, not an error", () => {
    expect(dueCards([], [], NOW)).toEqual([]);
  });
});

describe("dueCards — a dismissed card never returns, at any later time", () => {
  it("stays gone one second later", () => {
    const state: ReviewState = [record({ dismissed: true, lastShownAt: NOW - 1000 * DAY_MS })];
    expect(dueCards([item()], state, NOW + 1000)).toEqual([]);
  });

  it("stays gone a year later, even though every interval has long since elapsed", () => {
    const state: ReviewState = [record({ dismissed: true, lastShownAt: NOW - 400 * DAY_MS })];
    expect(dueCards([item()], state, NOW + 365 * DAY_MS)).toEqual([]);
  });
});

describe("INTERVALS_DAYS — the spacing ladder, asserted verbatim", () => {
  it("is exactly 1, 3, 7, 21 days", () => {
    expect(INTERVALS_DAYS).toEqual([1, 3, 7, 21]);
  });
});

describe("isDue — spacing is asserted at its boundaries", () => {
  for (const [rung, days] of INTERVALS_DAYS.entries()) {
    it(`rung ${rung} (${days}d): not due the moment before the interval elapses`, () => {
      const r = record({ lastShownAt: NOW, intervalIndex: rung });
      expect(isDue(r, NOW + days * DAY_MS - 1)).toBe(false);
    });

    it(`rung ${rung} (${days}d): due exactly when the interval elapses`, () => {
      const r = record({ lastShownAt: NOW, intervalIndex: rung });
      expect(isDue(r, NOW + days * DAY_MS)).toBe(true);
    });

    it(`rung ${rung} (${days}d): still due well after the interval elapses`, () => {
      const r = record({ lastShownAt: NOW, intervalIndex: rung });
      expect(isDue(r, NOW + days * DAY_MS + 1000)).toBe(true);
    });
  }
});

describe("nextInterval — acting on a card advances its next appearance", () => {
  it("remembering advances one rung", () => {
    expect(nextInterval(0, "remembered")).toBe(1);
    expect(nextInterval(1, "remembered")).toBe(2);
    expect(nextInterval(2, "remembered")).toBe(3);
  });

  it("remembering at the last rung stays capped — it does not run off the ladder", () => {
    expect(nextInterval(INTERVALS_DAYS.length - 1, "remembered")).toBe(INTERVALS_DAYS.length - 1);
  });

  it("forgetting resets to the first rung, however far out it had advanced", () => {
    expect(nextInterval(3, "forgot")).toBe(0);
    expect(nextInterval(0, "forgot")).toBe(0);
  });
});

describe("dueCards — end to end with an advanced review record", () => {
  it("a card that was remembered comes back only after the NEXT rung's spacing, not the old one", () => {
    const shownAt = NOW - 3 * DAY_MS; // shown 3 days ago
    const advanced = nextInterval(0, "remembered"); // -> rung 1 (3 days)
    const state: ReviewState = [record({ lastShownAt: shownAt, intervalIndex: advanced })];
    // Exactly 3 days have passed, matching rung 1's spacing — due now.
    expect(dueCards([item()], state, NOW)).toHaveLength(1);
    // One ms earlier it would not have been due yet.
    expect(dueCards([item()], state, NOW - 1)).toEqual([]);
  });
});

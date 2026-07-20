import { describe, expect, it } from "vitest";
import {
  contentHash,
  dateMarker,
  isDue,
  nextIntervalIndex,
  planFeedBatch,
  shuffleQuiz,
  type FeedCard,
  type FeedQuiz,
} from "./feed";

const NOW = Date.parse("2026-07-20T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

let n = 0;
function card(partial: Partial<FeedCard>): FeedCard {
  n++;
  return {
    id: partial.id ?? `c${n}`,
    topicId: "t1",
    subConcept: `sc${n}`,
    format: "concept",
    hook: `hook ${n}`,
    body: "body",
    status: "fresh",
    timesShown: 0,
    intervalIndex: 0,
    postable: false,
    contentHash: `h${n}`,
    createdAt: dateMarker(NOW - n * 1000),
    ...partial,
  };
}

const quiz = (over: Partial<FeedQuiz> = {}): FeedQuiz => ({
  kind: "recognition",
  question: "q?",
  options: ["a", "b", "c", "d"],
  answerIndex: 2,
  why: "because",
  ...over,
});

describe("nextIntervalIndex (SM-2-lite)", () => {
  it("advances on correct and caps at the last interval", () => {
    expect(nextIntervalIndex(0, true)).toBe(1);
    expect(nextIntervalIndex(2, true)).toBe(3);
    expect(nextIntervalIndex(3, true)).toBe(3);
  });
  it("resets to 0 on wrong", () => {
    expect(nextIntervalIndex(3, false)).toBe(0);
  });
});

describe("isDue", () => {
  it("kept card due after its interval elapses, not before", () => {
    const c = card({
      status: "kept",
      intervalIndex: 1, // 3 days
      lastShownAt: dateMarker(NOW - 2 * DAY),
    });
    expect(isDue(c, NOW)).toBe(false);
    expect(isDue({ ...c, lastShownAt: dateMarker(NOW - 3 * DAY) }, NOW)).toBe(true);
  });
  it("fresh card with a quiz history resurfaces; plain fresh never does", () => {
    const shown = { lastShownAt: dateMarker(NOW - 5 * DAY) };
    expect(isDue(card({ status: "fresh", lastResult: "wrong", ...shown }), NOW)).toBe(true);
    expect(isDue(card({ status: "fresh", ...shown }), NOW)).toBe(false);
  });
  it("killed and flagged never resurface", () => {
    const shown = { lastShownAt: dateMarker(NOW - 30 * DAY), lastResult: "correct" as const };
    expect(isDue(card({ status: "killed", ...shown }), NOW)).toBe(false);
    expect(isDue(card({ status: "flagged", ...shown }), NOW)).toBe(false);
  });
});

describe("planFeedBatch", () => {
  it("never serves two consecutive cards from the same topic when avoidable", () => {
    const all = [
      ...Array.from({ length: 5 }, () => card({ topicId: "tA" })),
      ...Array.from({ length: 5 }, () => card({ topicId: "tB" })),
    ];
    const batch = planFeedBatch(all, NOW, 10);
    for (let i = 1; i < batch.length; i++) {
      expect(batch[i].topicId).not.toBe(batch[i - 1].topicId);
    }
  });

  it("relaxes topic alternation rather than starving a single-topic pool", () => {
    const all = Array.from({ length: 4 }, () => card({ topicId: "only" }));
    expect(planFeedBatch(all, NOW, 4)).toHaveLength(4);
  });

  it("holds a quiz card until its sub-concept has a shown non-quiz card", () => {
    const all = [
      card({ id: "q", subConcept: "straw", format: "quiz", quiz: quiz(), topicId: "tA" }),
      card({ id: "e", subConcept: "straw", format: "concept", topicId: "tB" }),
      card({ id: "x", subConcept: "other", format: "concept", topicId: "tA" }),
    ];
    const batch = planFeedBatch(all, NOW, 3);
    const qPos = batch.findIndex((c) => c.id === "q");
    const ePos = batch.findIndex((c) => c.id === "e");
    expect(qPos).toBeGreaterThan(ePos); // exposure precedes the quiz
  });

  it("exposure gate is per-topic: same sub-concept name in another topic does not unlock", () => {
    const all = [
      // Topic A's "framing" concept was shown — must NOT unlock topic B's
      // "framing" quiz (bare sub-concept names collide across LLM-made maps).
      card({ subConcept: "framing", format: "concept", topicId: "tA", timesShown: 1 }),
      card({ id: "qB", subConcept: "framing", format: "quiz", quiz: quiz(), topicId: "tB" }),
      card({ id: "eB", subConcept: "framing", format: "concept", topicId: "tB" }),
      card({ subConcept: "other", format: "concept", topicId: "tA" }),
    ];
    const batch = planFeedBatch(all, NOW, 4);
    const qPos = batch.findIndex((c) => c.id === "qB");
    const ePos = batch.findIndex((c) => c.id === "eB");
    expect(qPos).toBeGreaterThan(ePos);
  });

  it("due cards respect topic alternation when the due pool allows it", () => {
    const dueA = card({ status: "kept", lastShownAt: dateMarker(NOW - 5 * DAY), topicId: "tA" });
    const dueB = card({ status: "kept", lastShownAt: dateMarker(NOW - 5 * DAY), topicId: "tB" });
    const freshA = card({ topicId: "tA" });
    // Slot 0 = freshA or freshB, slot 1 = due; the due pick must not repeat
    // the previous card's topic while an alternative exists.
    const batch = planFeedBatch([dueA, dueB, freshA, card({ topicId: "tB" })], NOW, 4);
    for (let i = 1; i < batch.length; i++) {
      expect(batch[i].topicId).not.toBe(batch[i - 1].topicId);
    }
  });

  it("serves an unexposed quiz over an empty feed (gate is last relaxation)", () => {
    const all = [card({ format: "quiz", quiz: quiz() })];
    expect(planFeedBatch(all, NOW, 1)).toHaveLength(1);
  });

  it("mixes due cards into ~30% of slots when due exist", () => {
    const dueCards = Array.from({ length: 4 }, () =>
      card({ status: "kept", lastShownAt: dateMarker(NOW - 5 * DAY), topicId: "tD" })
    );
    const freshCards = Array.from({ length: 8 }, (_, i) =>
      card({ topicId: i % 2 ? "tA" : "tB" })
    );
    const batch = planFeedBatch([...dueCards, ...freshCards], NOW, 9);
    const dueServed = batch.filter((c) => c.status === "kept").length;
    expect(dueServed).toBeGreaterThanOrEqual(2);
    expect(dueServed).toBeLessThanOrEqual(4);
  });

  it("does not resurface a card before its interval (short batch beats wrong batch)", () => {
    const all = [
      card({ status: "kept", intervalIndex: 3, lastShownAt: dateMarker(NOW - 1 * DAY) }),
    ];
    expect(planFeedBatch(all, NOW, 5)).toHaveLength(0);
  });

  it("returns no duplicates", () => {
    const all = Array.from({ length: 6 }, () => card({ topicId: `t${n % 3}` }));
    const batch = planFeedBatch(all, NOW, 20);
    expect(new Set(batch.map((c) => c.id)).size).toBe(batch.length);
  });
});

describe("shuffleQuiz", () => {
  it("remaps answerIndex so the right option stays right", () => {
    const q = quiz();
    for (let seed = 0; seed < 25; seed++) {
      const s = shuffleQuiz(q, seed);
      expect(s.options[s.answerIndex]).toBe(q.options[q.answerIndex]);
      expect([...s.options].sort()).toEqual([...q.options].sort());
    }
  });
  it("never carries distractor-ordered misconceptions into the shuffled copy", () => {
    const s = shuffleQuiz(quiz({ misconceptions: ["m1", "m2", "m3"] }), 3);
    expect(s.misconceptions).toBeUndefined();
  });
  it("is deterministic per seed and leaves the input untouched", () => {
    const q = quiz();
    expect(shuffleQuiz(q, 7)).toEqual(shuffleQuiz(q, 7));
    expect(q.answerIndex).toBe(2);
  });
});

describe("contentHash", () => {
  it("normalizes case, punctuation and whitespace", () => {
    expect(contentHash("Strawman!", "It's  bad.")).toBe(contentHash("strawman", "it s bad"));
    expect(contentHash("Strawman", "a")).not.toBe(contentHash("Steelman", "a"));
  });
});

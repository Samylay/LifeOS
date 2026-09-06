import { describe, it, expect } from "vitest";
import {
  extractPassages,
  verifyCandidate,
  MAX_PASSAGES_PER_ITEM,
  MIN_QUOTE_CHARS,
  type PassageCandidate,
  type ExtractedPassage,
} from "./passages";

const SOURCE =
  "The quick brown fox jumps over the lazy dog. Wide open spaces invite fast, careless movement, but only until something breaks the pattern.";

const ITEM = { id: "item-1", title: "A Good Post", url: "https://example.com/a-good-post" };

describe("verifyCandidate — verbatim or refused", () => {
  it("accepts a candidate whose quote exactly matches the source at its offsets", () => {
    const c = { start: 4, end: 25, quote: SOURCE.slice(4, 25) };
    expect(verifyCandidate(SOURCE, c)).toBe(true);
  });

  it("refuses a candidate whose quote differs from the source at those offsets (paraphrase / alteration)", () => {
    const c = { start: 4, end: 25, quote: "quick brown fox altered somehow" };
    expect(verifyCandidate(SOURCE, c)).toBe(false);
  });

  it("refuses a near-match — one character different from the true slice", () => {
    const real = SOURCE.slice(4, 25);
    const altered = real.slice(0, -1) + "x"; // last char swapped
    expect(verifyCandidate(SOURCE, { start: 4, end: 25, quote: altered })).toBe(false);
  });

  it("refuses a candidate whose end offset falls outside the source text", () => {
    const c = { start: 4, end: SOURCE.length + 50, quote: SOURCE.slice(4) };
    expect(verifyCandidate(SOURCE, c)).toBe(false);
  });

  it("refuses a negative start offset", () => {
    expect(verifyCandidate(SOURCE, { start: -1, end: 10, quote: SOURCE.slice(0, 10) })).toBe(false);
  });

  it("refuses an inverted or empty span (end <= start)", () => {
    expect(verifyCandidate(SOURCE, { start: 10, end: 10, quote: "" })).toBe(false);
    expect(verifyCandidate(SOURCE, { start: 10, end: 5, quote: "" })).toBe(false);
  });

  it("refuses a quote shorter than the minimum length even if it matches verbatim", () => {
    const short = SOURCE.slice(0, MIN_QUOTE_CHARS - 1);
    expect(verifyCandidate(SOURCE, { start: 0, end: short.length, quote: short })).toBe(false);
  });

  it("refuses a quote longer than the maximum length even if it matches verbatim", () => {
    const long = SOURCE.repeat(20).slice(0, 700);
    expect(long.length).toBeGreaterThan(600);
    expect(verifyCandidate(long, { start: 0, end: long.length, quote: long })).toBe(false);
  });
});

describe("extractPassages — a fetched source yields verbatim slices", () => {
  it("a candidate that matches the source verbatim becomes a stored passage carrying full provenance", () => {
    const c: PassageCandidate = { start: 0, end: 45, quote: SOURCE.slice(0, 45) };
    const [passage] = extractPassages(ITEM, SOURCE, [c]);
    expect(passage).toBeDefined();
    expect(passage.quote).toBe(SOURCE.slice(0, 45));
    expect(SOURCE.slice(passage.start, passage.end)).toBe(passage.quote);
    expect(passage.sourceItemId).toBe(ITEM.id);
    expect(passage.title).toBe(ITEM.title);
    expect(passage.url).toBe(ITEM.url);
  });

  it("a near-match or altered candidate is refused — nothing is stored for it", () => {
    const c: PassageCandidate = { start: 0, end: 45, quote: SOURCE.slice(0, 45).replace("quick", "swift") };
    expect(extractPassages(ITEM, SOURCE, [c])).toEqual([]);
  });

  it("an offset candidate that falls outside the stored text is refused rather than truncated", () => {
    const c: PassageCandidate = { start: 0, end: SOURCE.length + 100, quote: SOURCE };
    expect(extractPassages(ITEM, SOURCE, [c])).toEqual([]);
  });

  it("a mix of good and bad candidates keeps only the verified ones", () => {
    const good: PassageCandidate = { start: 0, end: 45, quote: SOURCE.slice(0, 45) };
    const bad: PassageCandidate = { start: 50, end: 70, quote: "not what is actually there here" };
    const result = extractPassages(ITEM, SOURCE, [good, bad]);
    expect(result).toHaveLength(1);
    expect(result[0].quote).toBe(good.quote);
  });

  it("returns an empty array, never a placeholder, when no candidate is offered", () => {
    expect(extractPassages(ITEM, SOURCE, [])).toEqual([]);
  });
});

describe("extractPassages — bounded per item", () => {
  it("never yields more than MAX_PASSAGES_PER_ITEM even with many valid candidates", () => {
    const candidates: PassageCandidate[] = [];
    let cursor = 0;
    while (candidates.length < MAX_PASSAGES_PER_ITEM + 5 && cursor + MIN_QUOTE_CHARS < SOURCE.length) {
      const end = cursor + MIN_QUOTE_CHARS;
      candidates.push({ start: cursor, end, quote: SOURCE.slice(cursor, end) });
      cursor = end;
    }
    const result = extractPassages(ITEM, SOURCE, candidates);
    expect(result.length).toBeLessThanOrEqual(MAX_PASSAGES_PER_ITEM);
  });
});

describe("extractPassages — re-running does not duplicate", () => {
  it("a candidate identical to one already extracted is skipped", () => {
    const c: PassageCandidate = { start: 0, end: 45, quote: SOURCE.slice(0, 45) };
    const already: ExtractedPassage[] = [
      { sourceItemId: ITEM.id, title: ITEM.title, url: ITEM.url, text: SOURCE, start: 0, end: 45, quote: c.quote },
    ];
    expect(extractPassages(ITEM, SOURCE, [c], already)).toEqual([]);
  });

  it("stops taking new candidates once the item's bound is already spent by prior runs", () => {
    const already: ExtractedPassage[] = Array.from({ length: MAX_PASSAGES_PER_ITEM }, (_, i) => ({
      sourceItemId: ITEM.id,
      title: ITEM.title,
      url: ITEM.url,
      text: SOURCE,
      start: i * 20,
      end: i * 20 + MIN_QUOTE_CHARS,
      quote: SOURCE.slice(i * 20, i * 20 + MIN_QUOTE_CHARS),
    }));
    const newCandidate: PassageCandidate = { start: 100, end: 130, quote: SOURCE.slice(100, 130) };
    expect(extractPassages(ITEM, SOURCE, [newCandidate], already)).toEqual([]);
  });

  it("existing passages belonging to a different item never count against this item's bound", () => {
    const already: ExtractedPassage[] = [
      { sourceItemId: "other-item", title: "x", url: "https://x", text: SOURCE, start: 0, end: 45, quote: SOURCE.slice(0, 45) },
    ];
    const c: PassageCandidate = { start: 50, end: 90, quote: SOURCE.slice(50, 90) };
    expect(extractPassages(ITEM, SOURCE, [c], already)).toHaveLength(1);
  });
});

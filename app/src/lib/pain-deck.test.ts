import { describe, expect, it } from "vitest";
import { clampQuote, isoOf, painKey } from "./pain-deck";

describe("painKey", () => {
  it("is stable across case and surrounding whitespace", () => {
    expect(painKey("HN", " 48746602 ")).toBe("hn:48746602");
    expect(painKey("hn", "48746602")).toBe(painKey("HN", "48746602"));
  });

  it("separates sources so an id collision across sources is not a dupe", () => {
    expect(painKey("hn", "123")).not.toBe(painKey("reddit", "123"));
  });
});

describe("isoOf", () => {
  it("reads the doc-store date marker and a bare string alike", () => {
    expect(isoOf({ __date: "2026-07-01T00:00:00.000Z" })).toBe("2026-07-01T00:00:00.000Z");
    expect(isoOf("2026-07-01T00:00:00.000Z")).toBe("2026-07-01T00:00:00.000Z");
  });

  it("returns empty for a missing marker rather than throwing", () => {
    expect(isoOf({})).toBe("");
  });
});

describe("clampQuote", () => {
  it("leaves a short quote untouched", () => {
    expect(clampQuote("we pay a guy $400/mo")).toBe("we pay a guy $400/mo");
  });

  it("collapses whitespace so pasted context does not render ragged", () => {
    expect(clampQuote("we  pay\n\na guy")).toBe("we pay a guy");
  });

  it("clamps on a word boundary and marks the cut", () => {
    const out = clampQuote("alpha bravo charlie delta", 12);
    expect(out).toBe("alpha bravo […]");
    expect(out).not.toContain("charlie");
  });
});

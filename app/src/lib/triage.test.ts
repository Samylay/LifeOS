import { describe, it, expect } from "vitest";
import { canonicalizeUrl, inferSource } from "./triage";

describe("inferSource", () => {
  it("maps X and Twitter hosts to x", () => {
    expect(inferSource("https://x.com/i/status/123")).toBe("x");
    expect(inferSource("https://twitter.com/levelsio/status/123")).toBe("x");
    expect(inferSource("https://mobile.twitter.com/a/status/1")).toBe("x");
  });
  it("maps Instagram hosts to instagram", () => {
    expect(inferSource("https://www.instagram.com/reel/AbC/")).toBe("instagram");
    expect(inferSource("https://instagram.com/p/XyZ/")).toBe("instagram");
  });
  it("everything else is other", () => {
    expect(inferSource("https://example.com/post")).toBe("other");
    expect(inferSource("not a url")).toBe("other");
  });
});

describe("canonicalizeUrl", () => {
  it("collapses any X status URL to x.com/i/status/<id>", () => {
    const id = "2075356658738278873";
    const forms = [
      `https://x.com/levelsio/status/${id}`,
      `https://twitter.com/levelsio/status/${id}?s=20&t=abc`,
      `https://x.com/i/status/${id}`,
      `https://mobile.x.com/levelsio/status/${id}/photo/1`,
    ];
    for (const f of forms) expect(canonicalizeUrl(f)).toBe(`https://x.com/i/status/${id}`);
  });

  it("collapses IG p/reel/tv URLs to a canonical form, reels->reel, drops igsh", () => {
    expect(canonicalizeUrl("https://www.instagram.com/reel/AbC123/?igsh=xxx")).toBe(
      "https://instagram.com/reel/AbC123"
    );
    expect(canonicalizeUrl("https://instagram.com/reels/AbC123/")).toBe(
      "https://instagram.com/reel/AbC123"
    );
    expect(canonicalizeUrl("https://instagram.com/p/XyZ/")).toBe("https://instagram.com/p/XyZ");
  });

  it("strips tracking params but keeps meaningful ones, sorted", () => {
    expect(canonicalizeUrl("https://ex.com/a?utm_source=x&id=5&b=2#frag")).toBe(
      "https://ex.com/a?b=2&id=5"
    );
  });

  it("two capture forms of the same tweet dedup to one canonical", () => {
    const a = canonicalizeUrl("https://twitter.com/foo/status/999?s=20");
    const b = canonicalizeUrl("https://x.com/i/status/999");
    expect(a).toBe(b);
  });

  it("non-URL input returns trimmed (still dedups against itself)", () => {
    expect(canonicalizeUrl("  garbage  ")).toBe("garbage");
  });
});

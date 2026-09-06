import { describe, it, expect, vi, afterEach } from "vitest";
import { isReadableSource, fetchSourceText } from "./source-fetch";

describe("isReadableSource — login walls are refused before any request", () => {
  it("refuses X/Twitter links", () => {
    expect(isReadableSource("https://x.com/someone/status/123")).toBe(false);
    expect(isReadableSource("https://twitter.com/someone/status/123")).toBe(false);
  });

  it("refuses Instagram links", () => {
    expect(isReadableSource("https://instagram.com/p/abc123")).toBe(false);
    expect(isReadableSource("https://www.instagram.com/reel/abc123")).toBe(false);
  });

  it("refuses YouTube links (no article text behind them)", () => {
    expect(isReadableSource("https://www.youtube.com/watch?v=abc123")).toBe(false);
    expect(isReadableSource("https://youtu.be/abc123")).toBe(false);
  });

  it("refuses non-http(s) input", () => {
    expect(isReadableSource("not a url")).toBe(false);
    expect(isReadableSource("ftp://example.com/thing")).toBe(false);
  });

  it("accepts an ordinary article URL", () => {
    expect(isReadableSource("https://example.com/some-article")).toBe(true);
  });
});

describe("fetchSourceText — a fetch failure is a normal outcome, never a thrown error", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns null for a login-walled URL without making a request", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const text = await fetchSourceText("https://x.com/someone/status/123");
    expect(text).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns the fetched text on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, text: async () => "Real article body text here." })
    );
    const text = await fetchSourceText("https://example.com/article");
    expect(text).toBe("Real article body text here.");
  });

  it("returns null on a non-2xx response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404, text: async () => "" }));
    const text = await fetchSourceText("https://example.com/dead-link");
    expect(text).toBeNull();
  });

  it("returns null when fetch throws (network error, timeout) instead of propagating", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    await expect(fetchSourceText("https://example.com/flaky")).resolves.toBeNull();
  });

  it("returns null for an empty body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, text: async () => "   " }));
    const text = await fetchSourceText("https://example.com/empty");
    expect(text).toBeNull();
  });
});

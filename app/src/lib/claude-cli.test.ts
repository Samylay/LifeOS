import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const ollamaGenerate = vi.fn();
vi.mock("./ollama", () => ({
  OLLAMA_MODEL: "qwen2.5:7b",
  ollamaGenerate: (p: string) => ollamaGenerate(p),
}));

import { generateText, generateReadOnlyJson, isLimitError } from "./claude-cli";

const fetchMock = vi.fn();
beforeEach(() => {
  ollamaGenerate.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("isLimitError", () => {
  it("matches the subscription 5h-cap message", () => {
    expect(isLimitError("Claude AI usage limit reached|1753900000")).toBe(true);
  });
  it("matches API rate-limit / overload shapes", () => {
    expect(isLimitError('{"type":"error","error":{"type":"rate_limit_error"}}')).toBe(true);
    expect(isLimitError('API Error: 429 {"type":"overloaded_error"}')).toBe(true);
    expect(isLimitError("You are out of extra usage for this billing cycle")).toBe(true);
  });
  it("does not match unrelated failures", () => {
    expect(isLimitError("claude: command not found")).toBe(false);
    expect(isLimitError("Invalid API key. Please run /login")).toBe(false);
    expect(isLimitError("no JSON in model output")).toBe(false);
  });
});

describe("gateway requests", () => {
  it("asks the gateway to prefer Codex instead of pinning it", async () => {
    fetchMock.mockResolvedValue(reply(200, { response: "hello", provider: "claude" }));
    expect(await generateText("p")).toBe("hello");
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.prefer).toBe("codex");
    expect(body).not.toHaveProperty("provider");
    expect(ollamaGenerate).not.toHaveBeenCalled();
  });

  it("puts a feature-owned system prompt ahead of read-only reviews", async () => {
    const previous = process.env.GEN_PROVIDER;
    process.env.GEN_PROVIDER = "codex";
    fetchMock.mockResolvedValue(reply(200, { response: '{"ok":true}' }));
    try {
      expect(await generateReadOnlyJson("review", "Review essays only.")).toEqual({ ok: true });
      expect(JSON.parse(fetchMock.mock.calls[0][1].body).prompt).toBe("Review essays only.\n\nreview");
    } finally { if (previous === undefined) delete process.env.GEN_PROVIDER; else process.env.GEN_PROVIDER = previous; }
  });

  it("shows the gateway's error when every provider is limited, without calling Ollama", async () => {
    fetchMock.mockResolvedValue(reply(503, { error: "no provider is available: every provider is limited, unavailable or failed" }));
    await expect(generateText("p")).rejects.toThrow(/every provider is limited/);
    expect(ollamaGenerate).not.toHaveBeenCalled();
  });

  it("rethrows non-limit failures without calling Ollama", async () => {
    fetchMock.mockRejectedValue(new Error("fetch failed"));
    await expect(generateText("p")).rejects.toThrow("fetch failed");
    expect(ollamaGenerate).not.toHaveBeenCalled();
  });

  it("reports an HTTP failure with no error body by its status", async () => {
    fetchMock.mockResolvedValue(reply(502, {}));
    await expect(generateText("p")).rejects.toThrow(/HTTP 502/);
  });
});

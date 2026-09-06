import { describe, it, expect, afterEach } from "vitest";
import { transcribeAudio } from "./voice-transcribe";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("transcribeAudio", () => {
  it("returns the transcript and language on success", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ transcript: "  hello there  ", language: "en" }), {
        status: 200,
      })) as typeof globalThis.fetch;
    const r = await transcribeAudio(Buffer.from("x"), "audio/webm");
    expect(r).toEqual({ ok: true, transcript: "hello there", language: "en" });
  });

  it("reports reason 'empty' for a blank transcript, distinct from a service failure", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ transcript: "   " }), { status: 200 })) as typeof globalThis.fetch;
    const r = await transcribeAudio(Buffer.from("x"), "audio/webm");
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("empty");
  });

  it("reports reason 'unreachable' for a non-2xx response", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: "boom" }), { status: 500 })) as typeof globalThis.fetch;
    const r = await transcribeAudio(Buffer.from("x"), "audio/webm");
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("unreachable");
  });

  it("reports reason 'unreachable' when the fetch itself throws, without throwing", async () => {
    globalThis.fetch = (async () => {
      throw new Error("connection refused");
    }) as typeof globalThis.fetch;
    const r = await transcribeAudio(Buffer.from("x"), "audio/webm");
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("unreachable");
    expect(r.error).toContain("connection refused");
  });
});

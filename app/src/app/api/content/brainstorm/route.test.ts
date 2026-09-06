import { describe, it, expect, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { NextRequest } from "next/server";

// Throwaway DB before anything opens the lazy singleton (mirrors
// server-db.test.ts and the triage ingest route test).
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lifeos-brainstorm-test-"));
process.env.LIFEOS_DB_PATH = path.join(tmpDir, "test.db");
process.env.GEN_PROVIDER = "claude-cli";

// The model is the thing under suspicion here, so it is stubbed and told to
// misbehave. No CLI, no subscription call.
const generateJson = vi.fn();
vi.mock("@/lib/claude-cli", () => ({
  claudeCliEnabled: () => true,
  generateJson: (p: string) => generateJson(p),
}));

const { POST } = await import("./route");

afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

function req(body: unknown): NextRequest {
  return new Request("http://localhost/api/content/brainstorm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

const IDEA = { title: "Why my agent picked the wrong task", body: "", contentType: "" };

describe("POST /api/content/brainstorm", () => {
  it("returns angles and questions when the model behaves", async () => {
    generateJson.mockResolvedValueOnce({
      angles: ["Frame it as a debugging story"],
      questions: ["What did you expect it to pick?"],
      contentType: "under-the-hood",
      hooks: [2],
    });
    const res = await POST(req(IDEA));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.brainstorm.angles).toEqual(["Frame it as a debugging story"]);
  });

  it("never asks the model for a script", async () => {
    generateJson.mockResolvedValueOnce({ angles: ["a"], questions: ["b"] });
    await POST(req(IDEA));
    const prompt = generateJson.mock.calls.at(-1)![0] as string;
    expect(prompt).not.toMatch(/write (a|the) script/i);
    expect(prompt).not.toMatch(/\bcaption\b/i);
    expect(prompt).toMatch(/angle/i);
  });

  // The point of the endpoint. A model that ignores its instructions must
  // produce a failure, not a postable draft on Samy's screen.
  const postable: Array<[string, unknown]> = [
    ["a script", { angles: ["a"], questions: ["b"], script: "HOOK: I spent three days..." }],
    ["a caption", { angles: ["a"], questions: ["b"], caption: "Here's what I learned 👇" }],
    ["hashtags", { angles: ["a"], questions: ["b"], hashtags: ["#buildinpublic"] }],
    ["script beats in an angle", { angles: ["HOOK: cold open\nBEAT 1: setup"], questions: [] }],
    ["nothing usable", { angles: [], questions: [] }],
  ];

  for (const [name, response] of postable) {
    it(`rejects ${name} with a failure, not content`, async () => {
      generateJson.mockResolvedValueOnce(response);
      const res = await POST(req(IDEA));
      expect(res.status).toBe(502);
      const json = await res.json();
      expect(json.brainstorm).toBeUndefined();
      expect(json.error).toBeTruthy();
      // The rejected text must not travel back inside the error either.
      expect(JSON.stringify(json)).not.toMatch(/HOOK:|buildinpublic|learned/i);
    });
  }

  it("a model failure is a 500, not a silent empty panel", async () => {
    generateJson.mockRejectedValueOnce(new Error("cli exploded"));
    const res = await POST(req(IDEA));
    expect(res.status).toBe(500);
    expect((await res.json()).brainstorm).toBeUndefined();
  });

  it("requires a title", async () => {
    const res = await POST(req({ title: "   " }));
    expect(res.status).toBe(400);
  });
});

import { describe, it, expect, afterAll, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import type { NextRequest } from "next/server";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lifeos-voice-recent-id-test-"));
process.env.LIFEOS_DB_PATH = path.join(tmpDir, "test.db");
const vaultDir = fs.mkdtempSync(path.join(os.tmpdir(), "lifeos-voice-recent-id-vault-"));
process.env.KB_PATH = vaultDir;
const audioDir = fs.mkdtempSync(path.join(os.tmpdir(), "lifeos-voice-recent-id-audio-"));
process.env.VOICE_AUDIO_DIR = audioDir;

const { createDoc, getDoc } = await import("@/lib/server-db");
const { PATCH, DELETE } = await import("./route");

const PENDING = "users/local/voicePending";
const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.rmSync(vaultDir, { recursive: true, force: true });
  fs.rmSync(audioDir, { recursive: true, force: true });
});

function patch(body: unknown): NextRequest {
  return new Request("http://localhost/api/voice/recent/x", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("PATCH /api/voice/recent/[id] — reroute", () => {
  it("moves a landed capture to a new destination", async () => {
    const id = createDoc(PENDING, {
      status: "confirmed",
      transcript: "a note that should have been an idea",
      outcome: { category: "capture", destination: "vault", note: "01-Inbox/voice/x.md" },
    });
    const res = await PATCH(patch({ action: "reroute", destination: "idea-bank" }), ctx(id));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.destination).toBe("idea-bank");
  });

  it("rejects an unknown destination", async () => {
    const id = createDoc(PENDING, {
      status: "confirmed",
      transcript: "x",
      outcome: { category: "capture", destination: "vault" },
    });
    const res = await PATCH(patch({ action: "reroute", destination: "somewhere-fake" }), ctx(id));
    expect(res.status).toBe(400);
  });

  it("reports failure without a 200 when the destination write fails", async () => {
    process.env.TODOIST_API_TOKEN = "test-token";
    globalThis.fetch = (async () => {
      throw new Error("down");
    }) as typeof globalThis.fetch;
    const id = createDoc(PENDING, {
      status: "confirmed",
      transcript: "book something",
      outcome: { category: "capture", destination: "vault" },
    });
    const res = await PATCH(patch({ action: "reroute", destination: "todoist" }), ctx(id));
    expect(res.status).not.toBe(200);
  });
});

describe("PATCH /api/voice/recent/[id] — retry-transcription", () => {
  it("re-transcribes and returns the new transcript", async () => {
    const audioPath = path.join(audioDir, "retry.webm");
    fs.writeFileSync(audioPath, Buffer.from("audio"));
    const id = createDoc(PENDING, { status: "failed", transcript: "", audioPath, error: "down" });
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ transcript: "recovered words" }), { status: 200 })) as typeof globalThis.fetch;

    const res = await PATCH(patch({ action: "retry-transcription" }), ctx(id));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.transcript).toBe("recovered words");
  });

  it("rejects an unknown action", async () => {
    const id = createDoc(PENDING, { status: "failed", transcript: "" });
    const res = await PATCH(patch({ action: "bogus" }), ctx(id));
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/voice/recent/[id] — discard", () => {
  it("marks the row discarded without deleting it", async () => {
    const id = createDoc(PENDING, { status: "pending", transcript: "not worth keeping" });
    const res = await DELETE({} as NextRequest, ctx(id));
    expect(res.status).toBe(200);
    const row = getDoc(PENDING, id) as { status: string; transcript: string } | null;
    expect(row).not.toBeNull();
    expect(row?.status).toBe("discarded");
    expect(row?.transcript).toBe("not worth keeping");
  });

  it("404s for an id that does not exist", async () => {
    const res = await DELETE({} as NextRequest, ctx("does-not-exist"));
    expect(res.status).toBe(404);
  });
});

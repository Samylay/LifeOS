import { describe, it, expect, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import type { NextRequest } from "next/server";

// Throwaway DB + throwaway vault before anything opens the lazy DB singleton
// or writes to KB_PATH (mirrors server-db.test.ts / triage ingest route test).
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lifeos-voice-save-test-"));
process.env.LIFEOS_DB_PATH = path.join(tmpDir, "test.db");
const vaultDir = fs.mkdtempSync(path.join(os.tmpdir(), "lifeos-voice-save-vault-"));
process.env.KB_PATH = vaultDir;

const { getDoc, createDoc, listDocs } = await import("@/lib/server-db");
const { POST } = await import("./route");

// The route imports todoist-client's default transport (globalThis.fetch)
// when TODOIST_API_TOKEN is set — stub it per-test so these never hit the
// wire, mirroring teach.test.ts / grilling.test.ts.
const originalFetch = globalThis.fetch;
const originalToken = process.env.TODOIST_API_TOKEN;

const PENDING = "users/local/voicePending";

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.rmSync(vaultDir, { recursive: true, force: true });
  globalThis.fetch = originalFetch;
  if (originalToken === undefined) delete process.env.TODOIST_API_TOKEN;
  else process.env.TODOIST_API_TOKEN = originalToken;
});

function req(body: unknown): NextRequest {
  return new Request("http://localhost/api/voice/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

describe("POST /api/voice/save — category=capture (the one-step hub)", () => {
  it("commits to the vault note and reports the vault destination", async () => {
    const res = await POST(
      req({ transcript: "thinking about the marathon plan", category: "capture", date: "2026-09-06" })
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.destination).toBe("vault");
    expect(data.note).toBe("01-Inbox/voice/2026-09-06.md");
    const written = fs.readFileSync(path.join(vaultDir, data.note), "utf-8");
    expect(written).toContain("thinking about the marathon plan");
  });

  it("strips a spoken destination prefix before it reaches the vault", async () => {
    const res = await POST(
      req({ transcript: "note: thinking about the offsite", category: "capture", date: "2026-09-06" })
    );
    const data = await res.json();
    const written = fs.readFileSync(path.join(vaultDir, data.note), "utf-8");
    expect(written).toContain("thinking about the offsite");
    expect(written).not.toMatch(/note:/i);
  });

  it("marks the pending row confirmed with the destination it landed in", async () => {
    const pendingId = createDoc(PENDING, {
      status: "pending",
      audioPath: "/data/voice-audio/x.webm",
      transcript: "a spoken idea",
    });
    await POST(req({ transcript: "a spoken idea", category: "capture", pendingId }));
    const row = getDoc(PENDING, pendingId) as { status: string; outcome?: { destination?: string } } | null;
    expect(row?.status).toBe("confirmed");
    expect(row?.outcome?.destination).toBe("vault");
  });

  it("still rejects an empty transcript", async () => {
    const res = await POST(req({ transcript: "   ", category: "capture" }));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/voice/save — a spoken content idea reaches the idea bank", () => {
  it("files the idea, indistinguishable in shape from a typed one", async () => {
    const before = listDocs("users/local/contentIdeas", {}).length;
    const res = await POST(
      req({
        transcript: "content idea: the thing nobody tells you about training for a 70.3",
        category: "capture",
      })
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.destination).toBe("idea-bank");
    const ideas = listDocs("users/local/contentIdeas", {});
    expect(ideas.length).toBe(before + 1);
    const idea = ideas[ideas.length - 1] as unknown as {
      title: string;
      pillar: string;
      status: string;
    };
    // The spoken destination prefix never reaches the stored text.
    expect(idea.title).toContain("the thing nobody tells you");
    expect(idea.title).not.toMatch(/content idea/i);
    expect(idea.status).toBe("idea");
    expect(idea.pillar).toBe("");
  });

  it("marks the pending row confirmed with the idea-bank destination", async () => {
    const pendingId = createDoc("users/local/voicePending", {
      status: "pending",
      audioPath: "/data/voice-audio/y.webm",
      transcript: "content idea: a good one",
    });
    await POST(req({ transcript: "content idea: a good one", category: "capture", pendingId }));
    const row = getDoc("users/local/voicePending", pendingId) as {
      status: string;
      outcome?: { destination?: string };
    } | null;
    expect(row?.status).toBe("confirmed");
    expect(row?.outcome?.destination).toBe("idea-bank");
  });
});

describe("POST /api/voice/save — a spoken action reaches Todoist", () => {
  it("creates a real Todoist task via the shared client, with the spoken due date", async () => {
    process.env.TODOIST_API_TOKEN = "test-token";
    const calls: Array<{ url: string; body: unknown }> = [];
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify({ id: "todoist-1" }), { status: 200 });
    }) as typeof globalThis.fetch;

    const res = await POST(
      req({ transcript: "task: book the bike fit Friday", category: "capture" })
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.destination).toBe("todoist");
    expect(data.taskId).toBe("todoist-1");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("api.todoist.com");
    expect(calls[0].body).toMatchObject({ content: "book the bike fit Friday", due_string: "Friday" });
  });

  it("lands undated when no time was spoken", async () => {
    process.env.TODOIST_API_TOKEN = "test-token";
    const calls: Array<{ body: unknown }> = [];
    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      calls.push({ body: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify({ id: "todoist-2" }), { status: 200 });
    }) as typeof globalThis.fetch;

    await POST(req({ transcript: "task: call the accountant", category: "capture" }));
    expect((calls[0].body as { due_string?: string }).due_string).toBeUndefined();
  });

  it("a failed Todoist write reports failure, leaves the take recoverable, and never marks it landed", async () => {
    process.env.TODOIST_API_TOKEN = "test-token";
    globalThis.fetch = (async () => {
      throw new Error("network down");
    }) as typeof globalThis.fetch;

    const pendingId = createDoc("users/local/voicePending", {
      status: "pending",
      audioPath: "/data/voice-audio/z.webm",
      transcript: "task: book the bike fit",
    });
    const res = await POST(
      req({ transcript: "task: book the bike fit", category: "capture", pendingId })
    );
    expect(res.status).not.toBe(200);
    const data = await res.json();
    expect(data.error).toBeTruthy();
    const row = getDoc("users/local/voicePending", pendingId) as { status: string } | null;
    expect(row?.status).toBe("pending");
  });
});

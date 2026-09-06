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

const { getDoc, createDoc } = await import("@/lib/server-db");
const { POST } = await import("./route");

const PENDING = "users/local/voicePending";

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.rmSync(vaultDir, { recursive: true, force: true });
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

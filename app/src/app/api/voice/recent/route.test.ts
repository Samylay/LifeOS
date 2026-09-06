import { describe, it, expect, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lifeos-voice-recent-test-"));
process.env.LIFEOS_DB_PATH = path.join(tmpDir, "test.db");

const { createDoc } = await import("@/lib/server-db");
const { GET } = await import("./route");

const PENDING = "users/local/voicePending";

afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

describe("GET /api/voice/recent", () => {
  it("lists only confirmed hub captures, newest first, with their destination", async () => {
    createDoc(PENDING, {
      status: "confirmed",
      transcript: "an old one",
      outcome: { category: "capture", destination: "vault", note: "01-Inbox/voice/2026-09-01.md" },
      createdAt: { __date: "2026-09-01T08:00:00.000Z" },
    });
    createDoc(PENDING, {
      status: "confirmed",
      transcript: "a newer one",
      outcome: { category: "capture", destination: "vault", note: "01-Inbox/voice/2026-09-05.md" },
      createdAt: { __date: "2026-09-05T08:00:00.000Z" },
    });
    // Noise this list must exclude: a talk-session commit, a still-pending
    // take, and a failed transcription — none of these are hub captures that
    // have landed anywhere yet.
    createDoc(PENDING, {
      status: "confirmed",
      transcript: "todays topics",
      outcome: { category: "talk-session", note: "01-Inbox/voice/2026-09-05.md" },
      createdAt: { __date: "2026-09-05T09:00:00.000Z" },
    });
    createDoc(PENDING, { status: "pending", transcript: "unreviewed" });
    createDoc(PENDING, { status: "failed", transcript: "", error: "whisper down" });

    const res = await GET();
    const data = await res.json();
    expect(data.captures.map((c: { transcript: string }) => c.transcript)).toEqual([
      "a newer one",
      "an old one",
    ]);
    expect(data.captures[0].destination).toBe("vault");
  });
});

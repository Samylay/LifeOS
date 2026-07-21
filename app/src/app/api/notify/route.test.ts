import { describe, it, expect, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import type { NextRequest } from "next/server";

// Point the lazy singleton DB at a throwaway file before importing the route
// (mirrors the other api route tests).
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lifeos-notify-test-"));
process.env.LIFEOS_DB_PATH = path.join(tmpDir, "test.db");

const { createDoc } = await import("@/lib/server-db");
const { GET, POST } = await import("./route");

const COLLECTION = "users/local/notifications";

function get(url: string): Promise<Response> {
  return GET(new Request(url) as unknown as NextRequest);
}

function post(body: unknown): Promise<Response> {
  return POST(
    new Request("http://localhost/api/notify", {
      method: "POST",
      body: JSON.stringify(body),
    }) as unknown as NextRequest
  );
}

// Seed with distinct, ordered createdAt so newest-first is unambiguous.
function seed(body: string, stream: string, minutesAgo: number) {
  createDoc(COLLECTION, {
    stream,
    severity: "info",
    title: null,
    body,
    actions: null,
    createdAt: { __date: new Date(Date.now() - minutesAgo * 60_000).toISOString() },
    readAt: null,
  });
}

afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

describe("GET /api/notify", () => {
  it("returns { latest } newest-first when called with no query params (notify-pipeline goal contract)", async () => {
    seed("oldest", "alerts", 30);
    seed("newest", "nightly", 1);
    seed("middle", "alerts", 10);

    const res = await get("http://localhost/api/notify");
    const json = await res.json();

    expect(json).toHaveProperty("latest");
    expect(json).not.toHaveProperty("messages");
    expect(json.latest.body).toBe("newest");
  });

  it("returns { messages } newest-first, capped by ?limit", async () => {
    const res = await get("http://localhost/api/notify?limit=2");
    const json = await res.json();

    expect(json).not.toHaveProperty("latest");
    expect(json.messages).toHaveLength(2);
    expect(json.messages[0].body).toBe("newest");
    expect(json.messages[1].body).toBe("middle");
  });

  it("filters by ?stream", async () => {
    const res = await get("http://localhost/api/notify?stream=alerts");
    const json = await res.json();

    expect(json.messages.map((m: { body: string }) => m.body)).toEqual(["middle", "oldest"]);
  });

  it("clamps a junk or oversized ?limit into [1,100]", async () => {
    const junk = await (await get("http://localhost/api/notify?limit=abc")).json();
    expect(junk.messages.length).toBeGreaterThan(0); // NaN -> default 20, not empty

    const huge = await (await get("http://localhost/api/notify?limit=99999")).json();
    expect(huge.messages.length).toBeLessThanOrEqual(100);
  });
});

// POSTs write rows stamped "now" — this block runs after the GET suite so it
// cannot disturb the newest-first assertions above.
describe("POST /api/notify deep-link path", () => {
  async function storedPath(text: string, extra: Record<string, unknown> = {}) {
    const res = await post({ text, ...extra });
    expect(res.status).toBe(200);
    const { id } = await res.json();
    const { getDoc } = await import("@/lib/server-db");
    return (getDoc(COLLECTION, id) as { path?: string }).path;
  }

  it("stores the caller's in-app path on the pager row", async () => {
    expect(await storedPath("deep-link me", { path: "/prime" })).toBe("/prime");
  });

  it("defaults by stream when no path is given (capture -> /decide, alerts -> /pager)", async () => {
    expect(await storedPath("📥 captured a reel")).toBe("/decide");
    expect(await storedPath("🚨 something broke")).toBe("/pager");
  });

  it("rejects non-path values back to the stream default (scheme, //, whitespace)", async () => {
    expect(await storedPath("bad path 1", { path: "https://evil.example/x" })).toBe("/pager");
    expect(await storedPath("bad path 2", { path: "//evil.example/x" })).toBe("/pager");
    expect(await storedPath("bad path 3", { path: "/pri me" })).toBe("/pager");
  });
});

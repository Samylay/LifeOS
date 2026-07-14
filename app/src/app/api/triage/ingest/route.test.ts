import { describe, it, expect, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import type { NextRequest } from "next/server";

// Point the lazy singleton DB at a throwaway file before importing anything
// that opens it (mirrors server-db.test.ts).
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lifeos-triage-ingest-test-"));
process.env.LIFEOS_DB_PATH = path.join(tmpDir, "test.db");

const { getDoc } = await import("@/lib/server-db");
const { POST } = await import("./route");

const COLLECTION = "users/local/triageQueue";

function req(body: unknown): NextRequest {
  return new Request("http://localhost/api/triage/ingest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

describe("POST /api/triage/ingest — folder hint", () => {
  it("persists the folder when the firefox grabber sends one", async () => {
    const res = await POST(req({ url: "https://roadmap.sh/ai-engineer", folder: "AI" }));
    expect(res.status).toBe(200);
    const { id, duplicate } = await res.json();
    expect(duplicate).toBe(false);
    expect(getDoc(COLLECTION, id)).toMatchObject({ folder: "AI" });
  });

  it("omits folder entirely when absent or blank (X/IG grabbers)", async () => {
    const a = await (await POST(req({ url: "https://example.com/a" }))).json();
    const b = await (await POST(req({ url: "https://example.com/b", folder: "   " }))).json();
    expect(getDoc(COLLECTION, a.id)).not.toHaveProperty("folder");
    expect(getDoc(COLLECTION, b.id)).not.toHaveProperty("folder");
  });

  it("keeps folder as a hint only — source still infers from the host", async () => {
    // A bookmarked tweet must stay source "x" so the study step reaches for
    // the syndication fetcher rather than the readable-text one.
    const res = await POST(
      req({ url: "https://x.com/i/status/123", folder: "AI" }),
    );
    const { id, source } = await res.json();
    expect(source).toBe("x");
    expect(getDoc(COLLECTION, id)).toMatchObject({ source: "x", folder: "AI" });
  });

  it("truncates an absurdly long folder name", async () => {
    const res = await POST(
      req({ url: "https://example.com/long", folder: "x".repeat(200) }),
    );
    const { id } = await res.json();
    const doc = getDoc(COLLECTION, id) as { folder: string };
    expect(doc.folder).toHaveLength(80);
  });
});

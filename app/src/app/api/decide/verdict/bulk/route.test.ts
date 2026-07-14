import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import type { NextRequest } from "next/server";

// Point the lazy singleton DB at a throwaway file before importing anything
// that opens it (mirrors server-db.test.ts).
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lifeos-verdict-bulk-test-"));
process.env.LIFEOS_DB_PATH = path.join(tmpDir, "test.db");

const { setDoc, getDoc } = await import("@/lib/server-db");
const { POST } = await import("./route");

const COLLECTION = "users/local/decisionQueue";

function req(body: unknown): NextRequest {
  return new Request("http://localhost/api/decide/verdict/bulk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

const seed = (id: string, status: string) => setDoc(COLLECTION, id, { status, title: id });

afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

describe("POST /api/decide/verdict/bulk", () => {
  beforeAll(() => {
    seed("p1", "pending");
    seed("p2", "pending");
    seed("d1", "decided"); // already ruled — should be skipped, not re-flipped
  });

  it("applies one verdict to every pending id and skips the rest", async () => {
    const res = await POST(req({ ids: ["p1", "p2", "d1", "missing"], verdict: "approved" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.applied.sort()).toEqual(["p1", "p2"]);
    expect(data.skipped.map((s: { id: string }) => s.id).sort()).toEqual(["d1", "missing"]);
    expect(getDoc(COLLECTION, "p1")).toMatchObject({ status: "decided", verdict: "approved" });
    expect(getDoc(COLLECTION, "p2")).toMatchObject({ status: "decided", verdict: "approved" });
  });

  it("rejects an unknown verdict", async () => {
    const res = await POST(req({ ids: ["p1"], verdict: "bogus" }));
    expect(res.status).toBe(400);
  });

  it("rejects an empty id list", async () => {
    const res = await POST(req({ ids: [], verdict: "approved" }));
    expect(res.status).toBe(400);
  });

  it("413s when the id list exceeds the per-call cap (forces client batching)", async () => {
    const ids = Array.from({ length: 51 }, (_, i) => `x${i}`);
    const res = await POST(req({ ids, verdict: "approved" }));
    expect(res.status).toBe(413);
    const data = await res.json();
    expect(data.maxPerCall).toBe(50);
  });
});

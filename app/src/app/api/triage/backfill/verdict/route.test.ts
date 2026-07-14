import { describe, it, expect, beforeEach, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import type { NextRequest } from "next/server";

// Point the lazy singleton DB at a throwaway file before importing anything
// that opens it (mirrors server-db.test.ts).
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lifeos-backfill-test-"));
process.env.LIFEOS_DB_PATH = path.join(tmpDir, "test.db");

const { setDoc, getDoc, listDocs } = await import("@/lib/server-db");
const { POST: verdict } = await import("./route");
const { POST: restore } = await import("../restore/route");
const { BACKFILL_COLLECTION } = await import("@/lib/bookmark-backfill");
const { TRIAGE_COLLECTION } = await import("@/lib/triage-ingest");

function req(url: string, body: unknown): NextRequest {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

const v = (body: unknown) => verdict(req("http://localhost/api/triage/backfill/verdict", body));
const r = (body: unknown) => restore(req("http://localhost/api/triage/backfill/restore", body));

function seed(id: string, url: string, status = "pending") {
  setDoc(BACKFILL_COLLECTION, id, {
    url,
    title: "t",
    folder: "AI",
    savedAt: { __date: "2024-01-01T00:00:00Z" },
    alive: true,
    httpStatus: 200,
    verdict: "drop",
    why: "obsolete",
    status,
  });
}

afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

describe("POST /api/triage/backfill/verdict", () => {
  beforeEach(() => {
    for (const d of listDocs(BACKFILL_COLLECTION)) setDoc(BACKFILL_COLLECTION, d.id, { status: "gone" });
    for (const d of listDocs(TRIAGE_COLLECTION)) setDoc(TRIAGE_COLLECTION, d.id, { url: "purged" });
  });

  it("drop marks the row and never enqueues anything", async () => {
    seed("b1", "https://example.com/old");
    const res = await v({ id: "b1", action: "drop" });
    expect(res.status).toBe(200);
    expect(getDoc(BACKFILL_COLLECTION, "b1")).toMatchObject({ status: "dropped" });
    expect(listDocs(TRIAGE_COLLECTION, { where: [["url", "==", "https://example.com/old"]] })).toHaveLength(0);
  });

  it("keep rescues the bookmark into the triage queue, carrying its folder", async () => {
    seed("b2", "https://example.com/keepme");
    const res = await v({ id: "b2", action: "keep" });
    expect(res.status).toBe(200);
    expect(getDoc(BACKFILL_COLLECTION, "b2")).toMatchObject({ status: "kept" });
    const queued = listDocs(TRIAGE_COLLECTION, { where: [["url", "==", "https://example.com/keepme"]] });
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({ status: "queued", folder: "AI" });
  });

  it("rejects a second verdict on the same row", async () => {
    seed("b3", "https://example.com/x", "dropped");
    expect((await v({ id: "b3", action: "keep" })).status).toBe(409);
  });

  it("rejects an unknown id and a bogus action", async () => {
    expect((await v({ id: "nope", action: "drop" })).status).toBe(404);
    seed("b4", "https://example.com/y");
    expect((await v({ id: "b4", action: "burn" })).status).toBe(400);
  });
});

describe("POST /api/triage/backfill/restore — undo must not leak", () => {
  it("undoing a keep removes the row it enqueued", async () => {
    seed("u1", "https://example.com/undome");
    await v({ id: "u1", action: "keep" });
    expect(listDocs(TRIAGE_COLLECTION, { where: [["url", "==", "https://example.com/undome"]] })).toHaveLength(1);

    const res = await r({ id: "u1" });
    expect(res.status).toBe(200);
    expect(getDoc(BACKFILL_COLLECTION, "u1")).toMatchObject({ status: "pending" });
    expect(listDocs(TRIAGE_COLLECTION, { where: [["url", "==", "https://example.com/undome"]] })).toHaveLength(0);
  });

  it("undoing a keep leaves a row that already existed alone", async () => {
    // The nightly grabber got there first — that row is not ours to delete.
    setDoc(TRIAGE_COLLECTION, "pre", {
      url: "https://example.com/preexisting",
      status: "queued",
    });
    seed("u2", "https://example.com/preexisting");
    await v({ id: "u2", action: "keep" });
    await r({ id: "u2" });
    expect(getDoc(TRIAGE_COLLECTION, "pre")).toMatchObject({ status: "queued" });
  });

  it("undoing a keep spares a row the study step already assessed", async () => {
    seed("u3", "https://example.com/studied");
    await v({ id: "u3", action: "keep" });
    const queued = listDocs(TRIAGE_COLLECTION, { where: [["url", "==", "https://example.com/studied"]] });
    setDoc(TRIAGE_COLLECTION, queued[0].id, { status: "proposed" });

    await r({ id: "u3" });
    // An Opus call was spent on it; the row has value of its own now.
    expect(getDoc(TRIAGE_COLLECTION, queued[0].id)).toMatchObject({ status: "proposed" });
  });

  it("undoing a drop puts the card back on the deck", async () => {
    seed("u4", "https://example.com/back");
    await v({ id: "u4", action: "drop" });
    await r({ id: "u4" });
    expect(getDoc(BACKFILL_COLLECTION, "u4")).toMatchObject({ status: "pending" });
  });
});

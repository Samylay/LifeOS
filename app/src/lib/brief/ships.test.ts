import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

// server-db caches its handle on first use — point it at a temp DB before
// importing anything that touches it (same pattern as server-db.test.ts).
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lifeos-ships-test-"));
process.env.LIFEOS_DB_PATH = path.join(tmpDir, "test.db");

const { createDoc } = await import("../server-db");
const { fetch: fetchShips } = await import("./fetchers/ships");

const PROJECTS = "users/local/projects";
const SHIPLOG = "users/local/shipLog";

const DAY_MS = 86_400_000;
const daysAgo = (n: number) => ({ __date: new Date(Date.now() - n * DAY_MS).toISOString() });

let staleId: string;
let freshId: string;

beforeAll(() => {
  staleId = createDoc(PROJECTS, {
    title: "Stale", status: "active", shippingEvent: "demo to a friend", createdAt: daysAgo(100),
  });
  freshId = createDoc(PROJECTS, {
    title: "Fresh", status: "active", createdAt: daysAgo(100),
  });
  createDoc(PROJECTS, { title: "Parked", status: "paused", createdAt: daysAgo(100) });
  createDoc(SHIPLOG, { projectId: staleId, what: "old demo", date: daysAgo(40) });
  createDoc(SHIPLOG, { projectId: freshId, what: "writeup posted", date: daysAgo(2) });
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("ships fetcher", () => {
  it("reports active projects stalest-first with days since last ship", async () => {
    const card = await fetchShips();
    if (card === null || Array.isArray(card)) throw new Error("expected one card");
    const body = card.body as {
      projects: { title: string; days: number; never_shipped: boolean; shipping_event: string | null }[];
      shipped_30d: number;
      tripwire: boolean;
    };

    // Paused project excluded; stalest first.
    expect(body.projects.map((p) => p.title)).toEqual(["Stale", "Fresh"]);
    expect(body.projects[0].days).toBe(40);
    expect(body.projects[0].never_shipped).toBe(false);
    expect(body.projects[0].shipping_event).toBe("demo to a friend");
    expect(body.projects[1].days).toBe(2);
    expect(body.projects[1].shipping_event).toBeNull();

    // One ship inside the 30-day window: no tripwire, amber (40d > 14d stale).
    expect(body.shipped_30d).toBe(1);
    expect(body.tripwire).toBe(false);
    expect(card.status).toBe("amber");
  });
});

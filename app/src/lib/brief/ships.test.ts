import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

// server-db caches its handle on first use — point it at a temp DB before
// importing anything that touches it (same pattern as server-db.test.ts).
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lifeos-ships-test-"));
process.env.LIFEOS_DB_PATH = path.join(tmpDir, "test.db");

const { createDoc } = await import("../server-db");
const { fetch: fetchShips, isOutward } = await import("./fetchers/ships");

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
  createDoc(SHIPLOG, { projectId: freshId, what: "writeup posted", toWhom: "the public", date: daysAgo(2) });
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
      shipped_outward_30d: number;
      tripwire: boolean;
    };

    // Paused project excluded; stalest first.
    expect(body.projects.map((p) => p.title)).toEqual(["Stale", "Fresh"]);
    expect(body.projects[0].days).toBe(40);
    expect(body.projects[0].never_shipped).toBe(false);
    expect(body.projects[0].shipping_event).toBe("demo to a friend");
    expect(body.projects[1].days).toBe(2);
    expect(body.projects[1].shipping_event).toBeNull();

    // One ship inside the 30-day window ("writeup posted" → the public,
    // outward): no tripwire, amber (40d > 14d stale).
    expect(body.shipped_30d).toBe(1);
    expect(body.shipped_outward_30d).toBe(1);
    expect(body.tripwire).toBe(false);
    expect(card.status).toBe("amber");
  });
});

describe("ships outward tripwire", () => {
  const daysAgoLocal = (n: number) => ({ __date: new Date(Date.now() - n * DAY_MS).toISOString() });

  it("fires the tripwire when every recent ship is internal", async () => {
    const projId = createDoc(PROJECTS, {
      title: "InternalOnly", status: "active", shippingEvent: "post it", createdAt: daysAgo(100),
    });
    // Three fresh ships, all internal by different signals.
    createDoc(SHIPLOG, { projectId: projId, what: "deploy", toWhom: "Samy (homelab)", date: daysAgoLocal(1) });
    createDoc(SHIPLOG, { projectId: projId, what: "fix", toWhom: "self", date: daysAgoLocal(1) });
    createDoc(SHIPLOG, { projectId: projId, what: "refactor", toWhom: "a client", tags: ["internal"], date: daysAgoLocal(1) });

    const card = await fetchShips();
    if (card === null || Array.isArray(card)) throw new Error("expected one card");
    const b = card.body as { shipped_30d: number; shipped_outward_30d: number; tripwire: boolean };

    // The earlier suite's outward ship ("the public") is also in-window, so
    // the *global* outward count is not zero — assert on the counts directly.
    expect(b.shipped_30d).toBeGreaterThanOrEqual(4);
    // "a client" would read as outward by audience, but the explicit internal
    // tag overrides — proving the flag beats the heuristic.
    expect(b.shipped_outward_30d).toBe(1); // only the "the public" ship
  });

});

describe("isOutward classification", () => {
  it("explicit outward flag wins over audience, either polarity", () => {
    expect(isOutward({ toWhom: "Samy (homelab)", outward: true })).toBe(true);
    expect(isOutward({ toWhom: "the JECT board", outward: false })).toBe(false);
  });
  it("infers internal from a Samy/self/homelab audience", () => {
    expect(isOutward({ toWhom: "Samy (LifeOS, tailnet)" })).toBe(false);
    expect(isOutward({ toWhom: "self" })).toBe(false);
    expect(isOutward({ toWhom: "Samy / homelab (INTERNAL)" })).toBe(false);
  });
  it("treats LifeOS/agent audiences as internal (single-user box; agent tooling)", () => {
    expect(isOutward({ toWhom: "LifeOS /projects + home" })).toBe(false);
    expect(isOutward({ toWhom: "LifeOS prod — daily use" })).toBe(false);
    expect(isOutward({ toWhom: "future agent sessions" })).toBe(false);
    expect(isOutward({ toWhom: "Ecole / future agents" })).toBe(false);
  });
  it("infers outward from a real external audience", () => {
    expect(isOutward({ toWhom: "the public" })).toBe(true);
    expect(isOutward({ toWhom: "one JECT member" })).toBe(true);
    expect(isOutward({ toWhom: "public visitors of ecole.samylayaida.com" })).toBe(true);
    // \bsamy\b does NOT match inside "samylayaida" (no boundary after "samy"),
    // so his own domain's visitors correctly read as outward.
    expect(isOutward({ toWhom: "samylayaida.com visitors" })).toBe(true);
  });
  it("treats an internal tag and a blank/unknown audience as internal", () => {
    expect(isOutward({ toWhom: "a client", tags: ["internal"] })).toBe(false);
    expect(isOutward({ toWhom: "" })).toBe(false);
    expect(isOutward({})).toBe(false);
  });
});

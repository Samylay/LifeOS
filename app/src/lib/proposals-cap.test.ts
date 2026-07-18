import { describe, it, expect, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

// Isolated from proposals.test.ts on purpose: the day-one-uncapped rule only
// holds on the VERY FIRST call ever against `users/local/proposalSurfaced`,
// so this test needs its own untouched temp DB rather than sharing one where
// other tests have already surfaced proposals.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lifeos-proposals-cap-test-"));
process.env.LIFEOS_DB_PATH = path.join(tmpDir, "test.db");

const { getProposals, rejectTopicProposal, CLUSTER_MIN, WEEKLY_CAP } = await import("./proposals");
const { createDoc } = await import("./server-db");
const { TRIAGE_COLLECTION } = await import("./triage-ingest");

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function saveItem(tag: string, createdAt: Date) {
  createDoc(TRIAGE_COLLECTION, {
    url: `https://example.com/${Math.random()}`,
    status: "proposed",
    topicTags: [tag],
    createdAt,
  });
}

describe("weekly cap (map ticket 11)", () => {
  it("day one is uncapped, subsequent weeks admit at most WEEKLY_CAP new proposals", () => {
    const day0 = new Date("2026-01-01T00:00:00Z");
    for (let i = 0; i < 5; i++) {
      for (let j = 0; j < CLUSTER_MIN; j++) saveItem(`burst-${i}`, day0);
    }
    const firstRun = getProposals(day0).filter((p) => p.tag.startsWith("burst-"));
    expect(firstRun.length).toBe(5); // uncapped on the very first run ever

    // A week+ later, decide (tombstone) the first batch so they stop being
    // candidates, then introduce 4 brand-new clusters.
    for (let i = 0; i < 5; i++) rejectTopicProposal(`burst-${i}`);
    const day8 = new Date("2026-01-09T00:00:00Z");
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < CLUSTER_MIN; j++) saveItem(`week2-${i}`, day8);
    }
    const secondRun = getProposals(day8).filter((p) => p.tag.startsWith("week2-"));
    expect(secondRun.length).toBe(WEEKLY_CAP);
  });
});

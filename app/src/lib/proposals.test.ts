import { describe, it, expect, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lifeos-proposals-test-"));
process.env.LIFEOS_DB_PATH = path.join(tmpDir, "test.db");

const {
  previewProposals,
  acceptTagProposal,
  rejectTagProposal,
  acceptTopicProposal,
  rejectTopicProposal,
  CLUSTER_MIN,
} = await import("./proposals");
const { createDoc } = await import("./server-db");
const { TRIAGE_COLLECTION } = await import("./triage-ingest");
const { isTagTombstoned } = await import("./teach");

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function saveItem(tag: string, createdAt?: Date) {
  createDoc(TRIAGE_COLLECTION, {
    url: `https://example.com/${Math.random()}`,
    status: "proposed",
    topicTags: [tag],
    createdAt: createdAt ?? new Date(),
  });
}

describe("topic-cluster trigger (count alone)", () => {
  it("does not propose below CLUSTER_MIN", () => {
    for (let i = 0; i < CLUSTER_MIN - 1; i++) saveItem("rust-below");
    const found = previewProposals().find((p) => p.kind === "topic" && p.tag === "rust-below");
    expect(found).toBeUndefined();
  });

  it("proposes at CLUSTER_MIN, recency-blind", () => {
    // An "old" cluster (fabricated past dates) proposes identically to a
    // fresh one — computeCandidates never reads createdAt.
    const old = new Date("2019-01-01");
    for (let i = 0; i < CLUSTER_MIN; i++) saveItem("solarpunk", old);
    const fresh = previewProposals().find((p) => p.kind === "topic" && p.tag === "solarpunk");
    expect(fresh).toBeDefined();
    expect(fresh).toMatchObject({ kind: "topic", tag: "solarpunk", count: CLUSTER_MIN });
  });
});

describe("'never' tombstones", () => {
  it("stops the tag proposing again after rejection", () => {
    for (let i = 0; i < CLUSTER_MIN; i++) saveItem("humor");
    expect(previewProposals().some((p) => p.kind === "topic" && p.tag === "humor")).toBe(true);

    rejectTopicProposal("humor");
    expect(isTagTombstoned("humor")).toBe(true);

    const rerun = previewProposals().filter((p) => p.kind === "topic" && p.tag === "humor");
    expect(rerun.length).toBe(0);
  });

  it("rejecting a tag proposal tombstones it and clears the pending doc", () => {
    createDoc("users/local/topicTagProposals", { tag: "never-tag" });
    expect(previewProposals().some((p) => p.kind === "tag" && p.tag === "never-tag")).toBe(true);

    rejectTagProposal("never-tag");
    expect(isTagTombstoned("never-tag")).toBe(true);
    expect(previewProposals().some((p) => p.kind === "tag" && p.tag === "never-tag")).toBe(false);
  });
});

describe("accept", () => {
  it("accepting a tag proposal adds it to the controlled list", () => {
    createDoc("users/local/topicTagProposals", { tag: "e-invoicing" });
    acceptTagProposal("e-invoicing");
    // no longer proposable — it's controlled now, not pending
    expect(previewProposals().some((p) => p.kind === "tag" && p.tag === "e-invoicing")).toBe(false);
  });

  it("refuses to accept a topic proposal without a mission", () => {
    expect(() => acceptTopicProposal("no-mission-tag", "")).toThrow(/mission/i);
    expect(() => acceptTopicProposal("no-mission-tag", "   ")).toThrow(/mission/i);
  });

  it("accepting a topic proposal with a mission creates a topic and stops re-proposing", () => {
    for (let i = 0; i < CLUSTER_MIN; i++) saveItem("kubernetes");
    expect(previewProposals().some((p) => p.kind === "topic" && p.tag === "kubernetes")).toBe(true);

    acceptTopicProposal("kubernetes", "run prod without fear");
    expect(previewProposals().some((p) => p.kind === "topic" && p.tag === "kubernetes")).toBe(false);
  });
});

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

// getDb() lazily opens the file on first use and caches env in a module-level
// singleton (see server-db.test.ts), so LIFEOS_DB_PATH must be set before any
// query runs — never point this at the real data/lifeos.db.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lifeos-teach-test-"));
process.env.LIFEOS_DB_PATH = path.join(tmpDir, "test.db");

const { addTopic, getTopic, neverProposeTag, isTagTombstoned, attachedItems } = await import(
  "./teach"
);
const { createDoc, updateDoc } = await import("./server-db");
const { TRIAGE_COLLECTION } = await import("./triage-ingest");

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("addTopic", () => {
  it("rejects a topic with no mission", () => {
    expect(() => addTopic("learn rust", "")).toThrow(/mission/i);
    expect(() => addTopic("learn rust", "   ")).toThrow(/mission/i);
  });

  it("accepts a topic with a mission, defaulting tags and origin", () => {
    const id = addTopic("learn rust", "ship the CLI faster");
    const topic = getTopic(id);
    expect(topic?.mission).toBe("ship the CLI faster");
    expect(topic?.tags).toEqual([]);
    expect(topic?.origin).toBe("authored");
    expect(topic?.status).toBe("queued");
  });

  it("stores the tags it's given", () => {
    const id = addTopic("learn zig", "curiosity", ["zig", "systems"]);
    expect(getTopic(id)?.tags).toEqual(["zig", "systems"]);
  });
});

describe("getTopic — tolerant read of legacy docs", () => {
  it("defaults missing mission/tags/origin instead of crashing", () => {
    const id = createDoc("users/local/teachTopics", {
      topic: "an old doc from before this schema",
      status: "queued",
      learningRecords: [],
    });
    const topic = getTopic(id);
    expect(topic).not.toBeNull();
    expect(topic?.mission).toBe("");
    expect(topic?.tags).toEqual([]);
    expect(topic?.origin).toBe("authored");
  });

  it("returns null for an unknown id", () => {
    expect(getTopic("does-not-exist")).toBeNull();
  });
});

describe("attachedItems — T56 attach-by-tag-overlap", () => {
  function item(topicTags: string[], status = "filed") {
    return createDoc(TRIAGE_COLLECTION, {
      url: `https://example.com/${Math.random()}`,
      rawUrl: `https://example.com/${Math.random()}`,
      source: "other",
      savedAt: new Date(),
      createdAt: new Date(),
      status,
      topicTags,
    });
  }

  it("attaches an item whose tags overlap the topic's, skips one that doesn't", () => {
    const topicId = addTopic("learn rust", "ship faster", ["rust", "systems"]);
    const overlapping = item(["rust", "web"]);
    const disjoint = item(["cooking"]);
    const ids = attachedItems(topicId).map((i) => i.id);
    expect(ids).toContain(overlapping);
    expect(ids).not.toContain(disjoint);
  });

  it("attaches a discarded item with overlapping tags — status is ignored", () => {
    const topicId = addTopic("learn zig", "curiosity", ["zig"]);
    const discarded = item(["zig"], "discarded");
    expect(attachedItems(topicId).map((i) => i.id)).toContain(discarded);
  });

  it("one item attaches to two topics", () => {
    const topicA = addTopic("learn go", "mission a", ["go"]);
    const topicB = addTopic("learn concurrency", "mission b", ["go", "concurrency"]);
    const shared = item(["go"]);
    expect(attachedItems(topicA).map((i) => i.id)).toContain(shared);
    expect(attachedItems(topicB).map((i) => i.id)).toContain(shared);
  });

  it("changing a topic's tags changes its material with no writes to items", () => {
    const topicId = addTopic("learn elixir", "curiosity", ["elixir"]);
    const target = item(["phoenix"]);
    expect(attachedItems(topicId).map((i) => i.id)).not.toContain(target);

    updateDoc("users/local/teachTopics", topicId, { tags: ["phoenix"] });
    expect(attachedItems(topicId).map((i) => i.id)).toContain(target);
  });
});

describe("topic-tag tombstones", () => {
  it("round-trips: untombstoned by default, tombstoned after neverProposeTag, and stays tombstoned", () => {
    expect(isTagTombstoned("humor")).toBe(false);
    neverProposeTag("humor");
    expect(isTagTombstoned("humor")).toBe(true);
    // idempotent re-tombstone shouldn't create a second ledger entry or flip back
    neverProposeTag("humor");
    expect(isTagTombstoned("humor")).toBe(true);
  });
});

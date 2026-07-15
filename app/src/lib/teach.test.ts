import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

// getDb() lazily opens the file on first use and caches env in a module-level
// singleton (see server-db.test.ts), so LIFEOS_DB_PATH must be set before any
// query runs — never point this at the real data/lifeos.db.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lifeos-teach-test-"));
process.env.LIFEOS_DB_PATH = path.join(tmpDir, "test.db");

const { addTopic, getTopic, neverProposeTag, isTagTombstoned } = await import("./teach");
const { createDoc } = await import("./server-db");

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

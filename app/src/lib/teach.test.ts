import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

// getDb() lazily opens the file on first use and caches env in a module-level
// singleton (see server-db.test.ts), so LIFEOS_DB_PATH must be set before any
// query runs — never point this at the real data/lifeos.db.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lifeos-teach-test-"));
process.env.LIFEOS_DB_PATH = path.join(tmpDir, "test.db");

const {
  addTopic,
  getTopic,
  neverProposeTag,
  isTagTombstoned,
  attachedItems,
  lastTaughtDate,
  latestProgress,
  selectMaterialForBudget,
  scheduleTopic,
  retryTodoistSchedules,
} = await import("./teach");
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

  it("gathering session material (attach + budget selection) never mutates the source items", async () => {
    const { getDoc } = await import("./server-db");
    const topicId = addTopic("learn rust", "ship faster", ["rust"]);
    const ids = Array.from({ length: 5 }, () => item(["rust"]));
    const before = ids.map((id) => JSON.stringify(getDoc(TRIAGE_COLLECTION, id)));
    selectMaterialForBudget(attachedItems(topicId), 15);
    selectMaterialForBudget(attachedItems(topicId), 60);
    const after = ids.map((id) => JSON.stringify(getDoc(TRIAGE_COLLECTION, id)));
    expect(after).toEqual(before);
  });

  it("changing a topic's tags changes its material with no writes to items", () => {
    const topicId = addTopic("learn elixir", "curiosity", ["elixir"]);
    const target = item(["phoenix"]);
    expect(attachedItems(topicId).map((i) => i.id)).not.toContain(target);

    updateDoc("users/local/teachTopics", topicId, { tags: ["phoenix"] });
    expect(attachedItems(topicId).map((i) => i.id)).toContain(target);
  });
});

describe("selectMaterialForBudget — T59 session material, bounded by time", () => {
  function items(n: number) {
    return Array.from({ length: n }, (_, i) => ({
      id: `item-${i}`,
      url: `https://example.com/${i}`,
      rawUrl: `https://example.com/${i}`,
      source: "other" as const,
      savedAt: new Date(),
      createdAt: new Date(),
      status: "filed" as const,
      topicTags: ["rust"],
    }));
  }

  it("returns everything unbounded when no time budget is given", () => {
    const pool = items(40);
    expect(selectMaterialForBudget(pool).length).toBe(40);
    expect(selectMaterialForBudget(pool, undefined).length).toBe(40);
  });

  it("a topic with 40 attached items still produces a bounded session", () => {
    const pool = items(40);
    const selected = selectMaterialForBudget(pool, 20);
    expect(selected.length).toBeGreaterThan(0);
    expect(selected.length).toBeLessThan(40);
  });

  it("same pool, different time budgets ⇒ different material selected", () => {
    const pool = items(40);
    const short = selectMaterialForBudget(pool, 15);
    const long = selectMaterialForBudget(pool, 60);
    expect(short.length).not.toBe(long.length);
    expect(short.map((i) => i.id)).not.toEqual(long.map((i) => i.id));
  });

  it("never mutates the source items", () => {
    const pool = items(40);
    const before = JSON.stringify(pool);
    selectMaterialForBudget(pool, 15);
    selectMaterialForBudget(pool, 60);
    expect(JSON.stringify(pool)).toBe(before);
  });

  it("small pools that already fit the budget aren't truncated", () => {
    const pool = items(3);
    expect(selectMaterialForBudget(pool, 60).length).toBe(3);
  });
});

describe("lastTaughtDate — T57's last-taught date, parsed from learningRecords", () => {
  it("returns null for a topic never taught", () => {
    expect(lastTaughtDate({ learningRecords: [] })).toBeNull();
  });

  it("extracts the date from the most recent dated record", () => {
    expect(
      lastTaughtDate({
        learningRecords: ["2026-07-01: got the boundary rules", "2026-07-15: caching still shaky"],
      })
    ).toBe("2026-07-15");
  });

  it("skips a malformed record without a date prefix", () => {
    expect(lastTaughtDate({ learningRecords: ["no date here"] })).toBeNull();
  });
});

describe("latestProgress — T61's narrative-only progress readout", () => {
  it("returns null when nothing has been taught yet (runs before any dated record exists)", () => {
    addTopic("untaught topic", "because");
    expect(latestProgress()).toBeNull();
  });

  it("picks the most recent record across topics, by date, verbatim", () => {
    const older = addTopic("progress topic A", "because A");
    const newer = addTopic("progress topic B", "because B");
    updateDoc("users/local/teachTopics", older, {
      learningRecords: ["2026-06-01: got the boundary rules"],
    });
    updateDoc("users/local/teachTopics", newer, {
      learningRecords: ["2026-07-18: caching still shaky"],
    });
    const progress = latestProgress();
    expect(progress).toEqual({
      topic: "progress topic B",
      date: "2026-07-18",
      text: "caching still shaky",
    });
  });

  it("never carries a number, percentage, or count — only prose", () => {
    const id = addTopic("prose-only topic", "because");
    updateDoc("users/local/teachTopics", id, {
      learningRecords: ["2099-01-01: understands the boundary rules now"],
    });
    const progress = latestProgress();
    expect(progress?.date).toBe("2099-01-01");
    expect(typeof progress?.text).toBe("string");
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

describe("scheduleTopic — writes a Todoist task (T60)", () => {
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.TODOIST_API_TOKEN;

  afterAll(() => {
    globalThis.fetch = originalFetch;
    process.env.TODOIST_API_TOKEN = originalToken;
  });

  it("schedules locally and posts one Todoist task with the topic sentence + due date", async () => {
    process.env.TODOIST_API_TOKEN = "test-token";
    const calls: Array<{ url: string; body: unknown }> = [];
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify({ id: "todoist-task-1" }), { status: 200 });
    }) as typeof globalThis.fetch;

    const id = addTopic("learn rust", "ship the CLI faster");
    await scheduleTopic(id, "2026-08-01");

    const topic = getTopic(id);
    expect(topic?.status).toBe("scheduled");
    expect(topic?.scheduledFor).toBe("2026-08-01");
    expect(topic?.todoistSynced).toBe(true);
    expect(topic?.todoistTaskId).toBe("todoist-task-1");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("api.todoist.com");
    expect(calls[0].body).toMatchObject({ content: "Learn: learn rust", due_date: "2026-08-01" });
  });

  it("a write failure leaves the topic scheduled locally and marks it for retry, not lost", async () => {
    process.env.TODOIST_API_TOKEN = "test-token";
    globalThis.fetch = (async () => {
      throw new Error("network down");
    }) as typeof globalThis.fetch;

    const id = addTopic("learn zig", "curiosity");
    await scheduleTopic(id, "2026-08-02");

    const topic = getTopic(id);
    expect(topic?.status).toBe("scheduled");
    expect(topic?.scheduledFor).toBe("2026-08-02");
    expect(topic?.todoistSynced).toBe(false);
  });

  it("retryTodoistSchedules retries only unsynced scheduled topics and syncs them on success", async () => {
    process.env.TODOIST_API_TOKEN = "test-token";
    globalThis.fetch = (async () => {
      throw new Error("network down");
    }) as typeof globalThis.fetch;
    const id = addTopic("learn nix", "reproducible boxes");
    await scheduleTopic(id, "2026-08-03");
    expect(getTopic(id)?.todoistSynced).toBe(false);

    const calls: Array<{ body: unknown }> = [];
    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      calls.push({ body: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify({ id: "todoist-task-retry" }), { status: 200 });
    }) as typeof globalThis.fetch;

    const { retried } = await retryTodoistSchedules();
    expect(retried).toContain(id);
    expect(calls.length).toBeGreaterThanOrEqual(1);
    const topic = getTopic(id);
    expect(topic?.todoistSynced).toBe(true);
    expect(topic?.todoistTaskId).toBe("todoist-task-retry");
  });

  it("does not attempt a live POST when no token is configured", async () => {
    delete process.env.TODOIST_API_TOKEN;
    let called = false;
    globalThis.fetch = (async () => {
      called = true;
      throw new Error("should not be called");
    }) as typeof globalThis.fetch;

    const id = addTopic("learn go", "faster CLIs");
    await scheduleTopic(id, "2026-08-04");

    expect(called).toBe(false);
    expect(getTopic(id)?.todoistSynced).toBe(false);
  });
});

import { describe, it, expect } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

// LIFEOS_DB_PATH must point at a temp file before the first query (see teach.test.ts).
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lifeos-teach-add-topic-test-"));
process.env.LIFEOS_DB_PATH = path.join(tmpDir, "test.db");

const { addTopic } = await import("./teach");
const { listDocs, updateDoc } = await import("./server-db");
const TOPICS = "users/local/teachTopics";
const named = (name: string) => listDocs(TOPICS).filter((t) => String(t.topic).trim().toLowerCase() === name);

describe("addTopic is idempotent for queued topics (CU-04, CU-06)", () => {
  it("returns the same id for the same request, ignoring case and spacing", () => {
    const first = addTopic("Rust lifetimes", "ship safer code", ["rust"]);
    const again = addTopic("  rust   LIFETIMES ", "Ship  safer code", ["rust"]);
    expect(again).toBe(first);
    expect(named("rust lifetimes")).toHaveLength(1);
  });

  it("a different mission or tag set is a different topic", () => {
    const a = addTopic("Graph theory", "pass the exam", ["math"]);
    expect(addTopic("Graph theory", "build a router", ["math"])).not.toBe(a);
    expect(addTopic("Graph theory", "pass the exam", ["cs"])).not.toBe(a);
  });

  it("three quick adds leave one topic", () => {
    const ids = [1, 2, 3].map(() => addTopic("Category theory", "think in arrows"));
    expect(new Set(ids).size).toBe(1);
    expect(named("category theory")).toHaveLength(1);
  });

  it("a topic that is no longer queued does not block a new one", () => {
    const old = addTopic("Sailing", "cross the channel");
    updateDoc(TOPICS, old, { status: "completed" });
    const fresh = addTopic("Sailing", "cross the channel again");
    expect(fresh).not.toBe(old);
    expect(named("sailing")).toHaveLength(2);
  });
});

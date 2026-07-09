import { describe, it, expect, beforeEach, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import {
  readBacklog,
  readUnfinishedBacklog,
  appendBacklogItem,
  markBacklogItemDone,
} from "./backlog";

// dataDir() reads LIFEOS_DB_PATH fresh each call, so point it at a fresh temp
// dir per test — never point this at the real data/lifeos.db.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lifeos-backlog-test-"));

beforeEach(() => {
  process.env.LIFEOS_DB_PATH = path.join(tmpDir, `${Math.random()}`, "test.db");
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("backlog", () => {
  it("reads an empty backlog for a centre with no file yet", () => {
    expect(readBacklog("workouts")).toEqual([]);
  });

  it("appends items and reads them back undone", () => {
    appendBacklogItem("polymath", "Read chapter 3");
    appendBacklogItem("polymath", "Review flashcards");
    expect(readBacklog("polymath")).toEqual([
      { text: "Read chapter 3", done: false },
      { text: "Review flashcards", done: false },
    ]);
  });

  it("marks an item done and excludes it from the unfinished list", () => {
    appendBacklogItem("swe-learning", "Finish exercise 1");
    appendBacklogItem("swe-learning", "Finish exercise 2");
    markBacklogItemDone("swe-learning", "Finish exercise 1");

    expect(readBacklog("swe-learning")).toEqual([
      { text: "Finish exercise 1", done: true },
      { text: "Finish exercise 2", done: false },
    ]);
    expect(readUnfinishedBacklog("swe-learning")).toEqual([
      { text: "Finish exercise 2", done: false },
    ]);
  });

  it("carries unfinished items across reads (persists to disk)", () => {
    appendBacklogItem("workouts", "Mobility routine");
    // simulate a fresh process reading the same file
    expect(readUnfinishedBacklog("workouts")).toEqual([
      { text: "Mobility routine", done: false },
    ]);
  });
});

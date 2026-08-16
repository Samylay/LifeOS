import { describe, it, expect, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lifeos-daily-blocks-test-"));
process.env.LIFEOS_DB_PATH = path.join(tmpDir, "test.db");

const { getDailyBlocks, setDailyBlocks, BLOCKS_PER_DAY } = await import("./daily-blocks");

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("daily-blocks", () => {
  it("defaults to 0 for a date with no doc", () => {
    expect(getDailyBlocks(new Date("2026-08-01T12:00:00Z"))).toEqual({
      date: "2026-08-01",
      blocksCompleted: 0,
    });
  });

  it("round-trips a set count keyed by date", () => {
    setDailyBlocks(3, new Date("2026-08-02T12:00:00Z"));
    expect(getDailyBlocks(new Date("2026-08-02T12:00:00Z"))).toEqual({
      date: "2026-08-02",
      blocksCompleted: 3,
    });
  });

  it("clamps to [0, BLOCKS_PER_DAY]", () => {
    setDailyBlocks(99, new Date("2026-08-03T12:00:00Z"));
    expect(getDailyBlocks(new Date("2026-08-03T12:00:00Z")).blocksCompleted).toBe(BLOCKS_PER_DAY);
    setDailyBlocks(-5, new Date("2026-08-04T12:00:00Z"));
    expect(getDailyBlocks(new Date("2026-08-04T12:00:00Z")).blocksCompleted).toBe(0);
  });

  it("re-setting the same date overwrites rather than duplicates", () => {
    setDailyBlocks(1, new Date("2026-08-05T12:00:00Z"));
    setDailyBlocks(2, new Date("2026-08-05T12:00:00Z"));
    expect(getDailyBlocks(new Date("2026-08-05T12:00:00Z")).blocksCompleted).toBe(2);
  });
});

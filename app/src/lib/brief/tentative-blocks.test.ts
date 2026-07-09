import { describe, it, expect } from "vitest";
import { computeTentativeBlocks, TENTATIVE_PREFIX } from "./tentative-blocks";

const DATE = "2026-07-10";
const TZ = "Asia/Tokyo";

describe("computeTentativeBlocks", () => {
  it("places the 6am workout anchor, protected minimums, then dynamic items when the day is empty", () => {
    const blocks = computeTentativeBlocks({ dateStr: DATE, tz: TZ, existing: [], dynamicItems: [] });
    expect(blocks).toHaveLength(3);
    expect(blocks[0].title).toBe(`${TENTATIVE_PREFIX}Workout`);
    expect(new Date(blocks[0].startIso).toLocaleTimeString("en-GB", { timeZone: TZ, hour12: false })).toMatch(
      /^06:00/
    );
    expect(blocks[1].title).toBe(`${TENTATIVE_PREFIX}polymath`);
    expect(blocks[2].title).toBe(`${TENTATIVE_PREFIX}software-engineering-learning`);
  });

  it("skips the workout anchor when an existing event already covers 6am", () => {
    const blocks = computeTentativeBlocks({
      dateStr: DATE,
      tz: TZ,
      existing: [
        { startIso: "2026-07-09T21:00:00.000Z", endIso: "2026-07-09T22:00:00.000Z" }, // 06:00-07:00 JST
      ],
      dynamicItems: [],
    });
    expect(blocks.some((b) => b.title.includes("Workout"))).toBe(false);
  });

  it("fills the 7am-10pm window with dynamic items in the order given, skipping busy slots", () => {
    const blocks = computeTentativeBlocks({
      dateStr: DATE,
      tz: TZ,
      existing: [],
      dynamicItems: [
        { centre: "LifeOS", title: "LifeOS: ship X" },
        { centre: "Flux", title: "Flux: ship Y" },
      ],
    });
    const titles = blocks.map((b) => b.title);
    expect(titles).toContain(`${TENTATIVE_PREFIX}LifeOS: ship X`);
    expect(titles).toContain(`${TENTATIVE_PREFIX}Flux: ship Y`);
    // dynamic items come after the fixed anchor + protected minimums
    const workoutIdx = titles.findIndex((t) => t.includes("Workout"));
    const dynamicIdx = titles.findIndex((t) => t.includes("LifeOS"));
    expect(dynamicIdx).toBeGreaterThan(workoutIdx);
  });

  it("never overlaps an existing event, and stops placing dynamic items once the window is full", () => {
    // Busy 7am-9:55pm JST leaves only a 5-min gap — not enough for a 30-min protected block.
    const blocks = computeTentativeBlocks({
      dateStr: DATE,
      tz: TZ,
      existing: [{ startIso: "2026-07-09T22:00:00.000Z", endIso: "2026-07-10T12:55:00.000Z" }],
      dynamicItems: [{ centre: "LifeOS", title: "LifeOS: ship X" }],
    });
    expect(blocks.every((b) => !b.title.includes("polymath") && !b.title.includes("LifeOS"))).toBe(true);
    // workout anchor (6am, before the busy window) still gets placed
    expect(blocks.some((b) => b.title.includes("Workout"))).toBe(true);
  });
});

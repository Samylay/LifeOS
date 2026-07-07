import { describe, it, expect } from "vitest";
import {
  currentStreak,
  rollingAverage,
  bestEffortsForStreams,
  weeklyBuckets,
  comparePeriods,
  type ActivityRow,
} from "./stats";

// Minimal ActivityRow factory — only the fields the pure functions read.
function act(partial: Partial<ActivityRow>): ActivityRow {
  return {
    id: 0,
    name: "",
    sport_type: "Run",
    start_date: "2026-01-01T10:00:00Z",
    start_date_local: null,
    distance_m: 0,
    moving_time_s: 0,
    elapsed_time_s: 0,
    total_elevation_gain_m: 0,
    average_speed_mps: null,
    max_speed_mps: null,
    average_heartrate: null,
    max_heartrate: null,
    average_cadence: null,
    average_watts: null,
    kilojoules: null,
    kudos_count: 0,
    achievement_count: 0,
    polyline: null,
    start_lat: null,
    start_lng: null,
    ...partial,
  };
}

const onDay = (day: string) => act({ start_date: `${day}T10:00:00Z` });

describe("currentStreak", () => {
  it("returns 0 for no activities", () => {
    expect(currentStreak([], new Date("2026-07-01T12:00:00Z"))).toBe(0);
  });

  it("counts consecutive days and stops at the first gap", () => {
    const rows = [onDay("2026-07-01"), onDay("2026-06-30"), onDay("2026-06-28")];
    expect(currentStreak(rows, new Date("2026-07-01T12:00:00Z"))).toBe(2);
  });

  it("still counts when today has no activity yet (starts from yesterday)", () => {
    const rows = [onDay("2026-06-30"), onDay("2026-06-29")];
    expect(currentStreak(rows, new Date("2026-07-01T12:00:00Z"))).toBe(2);
  });
});

describe("rollingAverage", () => {
  it("emits null until the window is filled, then the trailing mean", () => {
    expect(rollingAverage([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
  });
});

describe("bestEffortsForStreams", () => {
  it("finds the fastest window covering each target distance", () => {
    const distance = [0, 1000, 2000, 3000, 4000, 5000];
    const time = [0, 200, 400, 600, 800, 1000]; // steady 5 m/s
    const efforts = bestEffortsForStreams(distance, time, [1000, 5000]);
    expect(efforts.get(1000)).toBe(200);
    expect(efforts.get(5000)).toBe(1000);
  });

  it("returns an empty map for streams too short to measure", () => {
    expect(bestEffortsForStreams([0], [0], [1000]).size).toBe(0);
  });
});

describe("weeklyBuckets", () => {
  it("groups activities into ISO weeks starting Monday, sorted ascending", () => {
    // 2026-06-29 is a Monday; 2026-07-01 falls in the same ISO week.
    const rows = [
      act({ start_date: "2026-06-29T10:00:00Z", distance_m: 1000 }),
      act({ start_date: "2026-07-01T10:00:00Z", distance_m: 2000 }),
      act({ start_date: "2026-07-06T10:00:00Z", distance_m: 500 }),
    ];
    const buckets = weeklyBuckets(rows, "distance_m");
    expect(buckets).toEqual([
      { weekStart: "2026-06-29", value: 3000, count: 2 },
      { weekStart: "2026-07-06", value: 500, count: 1 },
    ]);
  });
});

describe("comparePeriods", () => {
  it("computes totals and the percentage delta of A relative to B", () => {
    const a = [act({ distance_m: 3000 })];
    const b = [act({ distance_m: 2000 })];
    const res = comparePeriods(a, b, "distance_m");
    expect(res.aTotal).toBe(3000);
    expect(res.bTotal).toBe(2000);
    expect(res.deltaPct).toBeCloseTo(50);
  });

  it("avoids divide-by-zero when the baseline is empty", () => {
    const res = comparePeriods([act({ distance_m: 1000 })], [], "distance_m");
    expect(res.deltaPct).toBe(0);
  });
});

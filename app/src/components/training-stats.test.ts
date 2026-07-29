import { describe, it, expect } from "vitest";
import {
  currentStreak,
  comparePeriods,
  paceHistogram,
  hrHistogram,
  type ActivityRow,
} from "./training-stats";

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
    suffer_score: null,
    kudos_count: 0,
    achievement_count: 0,
    gear_id: null,
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

describe("paceHistogram", () => {
  it("buckets by pace for the requested sport bucket, including sub-types", () => {
    const rows = [
      act({ sport_type: "Run", average_speed_mps: 1000 / 300 }), // 5:00/km
      act({ sport_type: "TrailRun", average_speed_mps: 1000 / 305 }), // same 15s bucket
      act({ sport_type: "Ride", average_speed_mps: 10 }), // filtered out
    ];
    const bins = paceHistogram(rows, "run");
    expect(bins.reduce((n, b) => n + b.count, 0)).toBe(2);
    expect(bins[0].label).toBe("5:00");
  });

  it("returns an empty list when no activity matches the sport", () => {
    expect(paceHistogram([act({ sport_type: "Ride", average_speed_mps: 10 })], "run")).toEqual([]);
  });
});

describe("hrHistogram", () => {
  it("buckets average HR in 5 bpm bins and skips rows without HR", () => {
    const rows = [
      act({ average_heartrate: 142 }),
      act({ average_heartrate: 144 }),
      act({ average_heartrate: 151 }),
      act({ average_heartrate: null }),
    ];
    const bins = hrHistogram(rows);
    expect(bins.reduce((n, b) => n + b.count, 0)).toBe(3);
    expect(bins[0].label).toBe("140");
  });
});

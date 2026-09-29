import { describe, expect, it } from "vitest";
import { trainingLoadHistory, type TrainingLoadPoint } from "./training-load";
import type { ActivityRow } from "@/components/training-stats";

const activity = (overrides: Partial<ActivityRow> = {}): ActivityRow => ({
  id: 1, name: "Run", sport_type: "Run", start_date: "2026-09-30T08:00:00Z",
  start_date_local: null, distance_m: 5000, moving_time_s: 1800, elapsed_time_s: 1800,
  total_elevation_gain_m: 0, average_speed_mps: 2.7, max_speed_mps: null,
  average_heartrate: null, max_heartrate: null, average_cadence: null,
  average_watts: null, kilojoules: null, suffer_score: null, kudos_count: 0,
  achievement_count: 0, gear_id: null, start_lat: null, start_lng: null,
  ...overrides,
});

describe("trainingLoadHistory", () => {
  it("uses the standard EMA recurrence on a tiny fixture", () => {
    const rows = trainingLoadHistory([activity({ suffer_score: 43 })], new Date("2026-09-30T12:00:00Z"), 2);
    const alpha = 2 / 43;
    const previous = 0;
    const expected = previous + alpha * (43 - previous);
    expect(rows).toHaveLength(2);
    expect(rows[1].ctl).toBeCloseTo(expected, 10);
    expect(rows[1].atl).toBeCloseTo(43 / 4, 10);
  });

  it("makes TSB negative after a high load day", () => {
    const rows = trainingLoadHistory([activity({ start_date: "2026-09-29T08:00:00Z", suffer_score: 100 })], new Date("2026-09-30T12:00:00Z"), 2);
    expect(rows[1].tsb).toBeLessThan(0);
  });

  it("returns zeroed history for empty activities", () => {
    const rows: TrainingLoadPoint[] = trainingLoadHistory([], new Date("2026-09-30T12:00:00Z"), 3);
    expect(rows).toHaveLength(3);
    expect(rows.every((point) => point.load === 0 && point.ctl === 0 && point.atl === 0 && point.tsb === 0)).toBe(true);
  });

  it("falls back from effort score to HR load and then duration load", () => {
    const rows = trainingLoadHistory([
      activity({ average_heartrate: 150, max_heartrate: 200 }),
      activity({ id: 2, start_date: "2026-09-29T08:00:00Z", moving_time_s: 1200 }),
    ], new Date("2026-09-30T12:00:00Z"), 2);
    expect(rows[0].load).toBe(10);
    expect(rows[1].load).toBeCloseTo(30 * 0.75 ** 2);
  });
});

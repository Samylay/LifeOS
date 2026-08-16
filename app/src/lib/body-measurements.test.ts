import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lifeos-body-measurements-test-"));
process.env.LIFEOS_DB_PATH = path.join(tmpDir, "test.db");

const fetchDailyNutrition = vi.fn();
const fetchWeight = vi.fn();
vi.mock("./garmin-service", () => ({ fetchDailyNutrition, fetchWeight }));

const { syncBodyMeasurementForDate, listRecentBodyMeasurements } = await import(
  "./body-measurements"
);

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("syncBodyMeasurementForDate", () => {
  it("writes weight + consumed kcal when both are present", async () => {
    fetchDailyNutrition.mockResolvedValue({ consumedKcal: 2100 });
    fetchWeight.mockResolvedValue({ weightKg: 78.4 });

    const r = await syncBodyMeasurementForDate("local", new Date("2026-08-01T12:00:00Z"));
    expect(r).toEqual({ date: "2026-08-01", written: true });

    const [doc] = listRecentBodyMeasurements(52);
    expect(doc).toEqual({ date: "2026-08-01", weightKg: 78.4, consumedKcal: 2100 });
  });

  it("skips rather than writing a zero when Garmin returns null for both", async () => {
    fetchDailyNutrition.mockResolvedValue(null);
    fetchWeight.mockResolvedValue(null);

    const r = await syncBodyMeasurementForDate("local", new Date("2026-08-02T12:00:00Z"));
    expect(r.written).toBe(false);
    expect(listRecentBodyMeasurements(52).find((d) => d.date === "2026-08-02")).toBeUndefined();
  });

  it("writes only the field Garmin has data for, preserving the other from a prior sync", async () => {
    fetchDailyNutrition.mockResolvedValue({ consumedKcal: 2200 });
    fetchWeight.mockResolvedValue({ weightKg: 78.0 });
    await syncBodyMeasurementForDate("local", new Date("2026-08-03T12:00:00Z"));

    fetchDailyNutrition.mockResolvedValue(null);
    fetchWeight.mockResolvedValue({ weightKg: 77.8 });
    await syncBodyMeasurementForDate("local", new Date("2026-08-03T12:00:00Z"));

    const doc = listRecentBodyMeasurements(52).find((d) => d.date === "2026-08-03");
    expect(doc).toEqual({ date: "2026-08-03", weightKg: 77.8, consumedKcal: 2200 });
  });

  it("is idempotent: running the same date twice does not duplicate rows", async () => {
    fetchDailyNutrition.mockResolvedValue({ consumedKcal: 1900 });
    fetchWeight.mockResolvedValue({ weightKg: 79.1 });
    await syncBodyMeasurementForDate("local", new Date("2026-08-04T12:00:00Z"));
    await syncBodyMeasurementForDate("local", new Date("2026-08-04T12:00:00Z"));

    const matches = listRecentBodyMeasurements(52).filter((d) => d.date === "2026-08-04");
    expect(matches).toHaveLength(1);
    expect(matches[0]).toEqual({ date: "2026-08-04", weightKg: 79.1, consumedKcal: 1900 });
  });
});

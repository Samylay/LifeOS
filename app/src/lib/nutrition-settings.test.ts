import { describe, it, expect, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lifeos-nutrition-settings-test-"));
process.env.LIFEOS_DB_PATH = path.join(tmpDir, "test.db");

const { getNutritionSettings, setNutritionSettings, DEFAULT_NUTRITION_SETTINGS } = await import(
  "./nutrition-settings"
);

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("nutrition-settings", () => {
  it("falls back to defaults when no doc exists", () => {
    expect(getNutritionSettings()).toEqual(DEFAULT_NUTRITION_SETTINGS);
  });

  it("round-trips a partial update, keeping the other field", () => {
    setNutritionSettings({ kcalTarget: 2300 });
    expect(getNutritionSettings()).toEqual({
      kcalTarget: 2300,
      weightTargetKg: DEFAULT_NUTRITION_SETTINGS.weightTargetKg,
    });
  });

  it("ignores an invalid stored value and falls back to default", () => {
    setNutritionSettings({ weightTargetKg: -1 as unknown as number });
    expect(getNutritionSettings().weightTargetKg).toBe(DEFAULT_NUTRITION_SETTINGS.weightTargetKg);
  });
});

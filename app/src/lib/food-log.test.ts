import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { foodDate, NUTRIENTS, validateEstimate } from "./food-model";

const directory = mkdtempSync(join(tmpdir(), "lifeos-food-test-"));
vi.stubEnv("LIFEOS_DB_PATH", join(directory, "test.db"));
vi.stubEnv("CODEX_BRIDGE_URL", "http://bridge.test/generate");
const { saveFoodPhoto, getFoodPhoto, listFoodPhotos, processFoodPhoto, correctFoodPhoto, nutritionSummary, photoBytes } = await import("./food-log");
const { updateDoc } = await import("./server-db");
afterEach(() => vi.unstubAllGlobals());
afterAll(() => { vi.unstubAllEnvs(); rmSync(directory, { recursive: true, force: true }); });

const image = Buffer.from([255,216,255,224,0,16,74,70,73,70,0,1,0,0,0,0]);
const upload = (id: string, extra = {}) => saveFoodPhoto({ id, sessionId: "nutrition-session", caption: "lunch", mime: "image/jpeg", bytes: image, eatenAt: "2026-09-26T12:00:00+02:00", timezone: "Europe/Paris", ...extra });
const estimate = (food = true) => ({ isFood: food, title: food ? "Rice and tofu" : "A keyboard", foods: food ? [{ name: "Rice", grams: 200 }, { name: "Tofu", grams: 100 }] : [], nutrients: Object.fromEntries(Object.keys(NUTRIENTS).map((key) => [key, food ? ({ kcal: 500, protein: 20, carbs: 70, fat: 15, fibre: 3 } as Record<string, number>)[key] ?? null : null])), assumptions: ["Oil quantity is uncertain."], question: null, confidence: "medium" });
const model = (result: unknown) => vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ response: JSON.stringify(result) }), { status: 200, headers: { "Content-Type": "application/json" } })));

describe("food photo ingestion and corrections", () => {
  it("persists a photo before analysis and makes repeated uploads idempotent", () => {
    expect(upload("duplicate-photo").state).toBe("pending");
    upload("duplicate-photo");
    expect(listFoodPhotos().filter((p) => p.id === "duplicate-photo")).toHaveLength(1);
    expect(photoBytes("duplicate-photo")).toEqual(image);
    expect(() => upload("duplicate-photo", { sessionId: "other" })).toThrow("another upload");
  });
  it("rejects traversal, mismatched types, oversized images and ambiguous timezones", () => {
    expect(() => upload("../unsafe")).toThrow("Invalid");
    expect(() => upload("bad-mime", { mime: "image/png" })).toThrow("JPEG");
    expect(() => upload("big", { bytes: Buffer.alloc(2_500_001) })).toThrow("2.5 MB");
    expect(() => upload("bad-time", { eatenAt: "2026-09-26T12:00" })).toThrow("timezone");
    expect(() => upload("bad-zone", { timezone: "Unknown/Somewhere" })).toThrow("timezone");
  });
  it("classifies non-food without adding a meal or treating missing nutrients as zero", async () => {
    upload("keyboard"); model(estimate(false)); await processFoodPhoto("keyboard");
    expect(getFoodPhoto("keyboard").estimate?.isFood).toBe(false);
    const summary = nutritionSummary("2026-09-26", "Europe/Paris");
    expect(summary.mealCount).toBe(0);
    expect(summary.totals.calcium.value).toBeNull();
  });
  it("claims work once and preserves a fraction correction made during analysis", async () => {
    upload("meal");
    let resolve!: (value: Response) => void;
    const fetch = vi.fn(() => new Promise<Response>((r) => { resolve = r; }));
    vi.stubGlobal("fetch", fetch);
    const first = processFoodPhoto("meal");
    await processFoodPhoto("meal");
    expect(fetch).toHaveBeenCalledOnce();
    correctFoodPhoto("meal", { portion: 0.5 });
    resolve(new Response(JSON.stringify({ response: JSON.stringify(estimate()) }), { status: 200 }));
    await first;
    const summary = nutritionSummary("2026-09-26", "Europe/Paris");
    expect(summary.mealCount).toBe(1);
    expect(summary.totals.kcal.value).toBe(250);
    expect(summary.totals.protein.value).toBe(10);
    expect(summary.totals.calcium).toEqual({ value: null, knownMeals: 0 });
    expect(() => correctFoodPhoto("meal", { portion: 1, revision: 0 })).toThrow("changed");
    expect(() => correctFoodPhoto("meal", { portion: -1 })).toThrow("Portion");
  });
  it("moves a corrected meal between local dates without counting it twice", () => {
    correctFoodPhoto("meal", { eatenAt: "2026-09-25T23:30:00+02:00" });
    expect(nutritionSummary("2026-09-26", "Europe/Paris").mealCount).toBe(0);
    expect(nutritionSummary("2026-09-25", "Europe/Paris").totals.kcal.value).toBe(250);
    expect(nutritionSummary("2026-09-26", "Asia/Tokyo").mealCount).toBe(1);
  });
  it("keeps failed uploads retryable and resumes expired workers", async () => {
    upload("failure"); model({ isFood: true }); await processFoodPhoto("failure");
    expect(getFoodPhoto("failure").state).toBe("failed");
    expect(getFoodPhoto("failure").estimate).toBeNull();
    correctFoodPhoto("failure", { retry: true });
    updateDoc("users/local/foodPhotos", "failure", { state: "running", startedAt: "2026-01-01T00:00:00Z" });
    model(estimate()); await processFoodPhoto("failure");
    expect(getFoodPhoto("failure").state).toBe("ready");
  });
  it("rejects fabricated or negative nutrient values and uses civil calendar days", () => {
    const invalid = estimate(); invalid.nutrients.kcal = -1;
    expect(() => validateEstimate(invalid)).toThrow("kcal");
    expect(foodDate("2026-09-25T23:30:00Z", "Europe/Paris")).toBe("2026-09-26");
    expect(() => nutritionSummary("2026-02-30")).toThrow("valid date");
  });
  it("uses an explicitly captioned eating time without overriding a concurrent manual edit", async () => {
    upload("caption-time");
    model({ ...estimate(), eatenAt: "2026-09-25T08:00:00+02:00" });
    await processFoodPhoto("caption-time");
    expect(getFoodPhoto("caption-time").eatenAt).toBe("2026-09-25T06:00:00.000Z");
    upload("manual-time");
    let resolve!: (value: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((r) => { resolve = r; })));
    const job = processFoodPhoto("manual-time");
    correctFoodPhoto("manual-time", { eatenAt: "2026-09-24T20:00:00+02:00" });
    resolve(new Response(JSON.stringify({ response: JSON.stringify({ ...estimate(), eatenAt: "2026-09-25T08:00:00+02:00" }) }), { status: 200 }));
    await job;
    expect(getFoodPhoto("manual-time").eatenAt).toBe("2026-09-24T18:00:00.000Z");
  });
});

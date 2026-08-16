// Nutrition targets — kcal target and weight target, previously hard-coded at
// the top of nutrition-card.tsx. Same settings collection/doc-per-feature
// pattern as notify-gateway.ts (users/local/settings, one doc per area).
import { getDoc, setDoc } from "@/lib/server-db";
import type { NutritionSettings } from "@/lib/nutrition-constants";
import { DEFAULT_NUTRITION_SETTINGS } from "@/lib/nutrition-constants";

export const SETTINGS_COLLECTION = "users/local/settings";
export const SETTINGS_DOC_ID = "nutrition";
export type { NutritionSettings };
export { DEFAULT_NUTRITION_SETTINGS };

function validPositiveNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v > 0;
}

/** Read settings tolerantly: absent doc or fields fall back to defaults. */
export function getNutritionSettings(): NutritionSettings {
  const doc = getDoc(SETTINGS_COLLECTION, SETTINGS_DOC_ID);
  if (!doc) return { ...DEFAULT_NUTRITION_SETTINGS };
  return {
    kcalTarget: validPositiveNumber(doc.kcalTarget)
      ? doc.kcalTarget
      : DEFAULT_NUTRITION_SETTINGS.kcalTarget,
    weightTargetKg: validPositiveNumber(doc.weightTargetKg)
      ? doc.weightTargetKg
      : DEFAULT_NUTRITION_SETTINGS.weightTargetKg,
  };
}

export function setNutritionSettings(partial: Partial<NutritionSettings>): NutritionSettings {
  const next = { ...getNutritionSettings(), ...partial };
  setDoc(SETTINGS_COLLECTION, SETTINGS_DOC_ID, next, true);
  return next;
}

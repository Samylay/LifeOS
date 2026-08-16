// Client-safe constants shared between the server-only settings/counter
// modules (nutrition-settings.ts, daily-blocks.ts — both import server-db,
// which pulls in better-sqlite3/fs and cannot be bundled for the browser) and
// nutrition-card.tsx, which needs the shapes/defaults without the server code.

export interface NutritionSettings {
  kcalTarget: number;
  weightTargetKg: number;
}

// Set by the Aug–Dec 2026 block: a ~300 kcal deficit, not 400, because the
// governing constraint is "sessions frequent, never tired". Do not tighten
// these without Samy saying so.
export const DEFAULT_NUTRITION_SETTINGS: NutritionSettings = {
  kcalTarget: 2450,
  weightTargetKg: 79,
};

export const BLOCKS_PER_DAY = 4;

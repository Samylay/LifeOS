export const NUTRIENTS = {
  kcal: { label: "Energy", unit: "kcal" }, protein: { label: "Protein", unit: "g" },
  carbs: { label: "Carbs", unit: "g" }, fat: { label: "Fat", unit: "g" },
  fibre: { label: "Fibre", unit: "g" }, sodium: { label: "Sodium", unit: "mg" },
  calcium: { label: "Calcium", unit: "mg" }, iron: { label: "Iron", unit: "mg" },
  magnesium: { label: "Magnesium", unit: "mg" }, potassium: { label: "Potassium", unit: "mg" },
  vitaminA: { label: "Vitamin A", unit: "µg RAE" }, vitaminC: { label: "Vitamin C", unit: "mg" },
  vitaminD: { label: "Vitamin D", unit: "µg" }, vitaminB12: { label: "Vitamin B12", unit: "µg" },
  folate: { label: "Folate", unit: "µg DFE" }, zinc: { label: "Zinc", unit: "mg" },
} as const;
export type Nutrient = keyof typeof NUTRIENTS;
export type Nutrients = Record<Nutrient, number | null>;
export interface FoodEstimate {
  isFood: boolean;
  title: string;
  foods: Array<{ name: string; grams: number | null }>;
  nutrients: Nutrients;
  assumptions: string[];
  question: string | null;
  confidence: "low" | "medium";
  eatenAt?: string | null;
}
export interface FoodPhoto {
  id: string; sessionId: string; caption: string; mime: string; imageUrl: string;
  createdAt: string; eatenAt: string; timezone: string;
  state: "pending" | "running" | "ready" | "failed";
  estimate: FoodEstimate | null; portion: number; revision: number;
  correction: string; error: string | null; startedAt?: string;
}
export class FoodError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export function validId(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9-]{1,100}$/.test(value);
}
export function foodDate(instant: string, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(instant));
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function validateFoodTime(instant: unknown, timezone: unknown) {
  if (typeof instant !== "string" || !Number.isFinite(Date.parse(instant)) || !/(Z|[+-]\d{2}:\d{2})$/.test(instant)) throw new FoodError("Eating time must include its timezone");
  if (typeof timezone !== "string" || timezone.length > 100) throw new FoodError("Choose a valid timezone");
  try { foodDate(instant, timezone); } catch { throw new FoodError("Choose a valid timezone"); }
  return { eatenAt: new Date(instant).toISOString(), timezone };
}
export function validateEstimate(value: unknown): FoodEstimate {
  if (!value || typeof value !== "object") throw new FoodError("Image analysis returned an invalid estimate", 502);
  const v = value as Record<string, unknown>;
  if (typeof v.isFood !== "boolean" || typeof v.title !== "string" || !v.title.trim() || v.title.length > 200 || !Array.isArray(v.foods) || !Array.isArray(v.assumptions)) throw new FoodError("Image analysis returned an incomplete estimate", 502);
  const raw = v.nutrients as Record<string, unknown> | undefined;
  const nutrients = Object.fromEntries(Object.keys(NUTRIENTS).map((key) => {
    const n = raw?.[key];
    if (n !== null && (typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > 100_000)) throw new FoodError(`Invalid ${key} estimate`, 502);
    return [key, v.isFood ? n : null];
  })) as Nutrients;
  const foods = v.foods.slice(0, 20).map((food: unknown) => {
    if (!food || typeof food !== "object") throw new FoodError("Invalid food estimate", 502);
    const f = food as Record<string, unknown>;
    if (typeof f.name !== "string" || !f.name.trim() || f.name.length > 200 || (f.grams !== null && (typeof f.grams !== "number" || !Number.isFinite(f.grams) || f.grams < 0 || f.grams > 10_000))) throw new FoodError("Invalid portion estimate", 502);
    return { name: f.name, grams: f.grams as number | null };
  });
  if (v.isFood && !foods.length) throw new FoodError("No foods identified", 502);
  if (v.assumptions.some((s) => typeof s !== "string" || s.length > 500) || (v.question !== null && (typeof v.question !== "string" || v.question.length > 500))) throw new FoodError("Invalid estimate explanation", 502);
  if (v.eatenAt !== undefined && v.eatenAt !== null && (typeof v.eatenAt !== "string" || !Number.isFinite(Date.parse(v.eatenAt)) || !/(Z|[+-]\d{2}:\d{2})$/.test(v.eatenAt))) throw new FoodError("Invalid eating time estimate", 502);
  return { isFood: v.isFood, title: v.title, foods, nutrients, assumptions: v.assumptions.slice(0, 8) as string[], question: v.question as string | null, confidence: v.confidence === "medium" ? "medium" : "low", eatenAt: typeof v.eatenAt === "string" ? new Date(v.eatenAt).toISOString() : null };
}
export function foodTotals(photos: FoodPhoto[], date: string, timezone: string) {
  const meals = photos.filter((p) => p.state === "ready" && p.estimate?.isFood && foodDate(p.eatenAt, timezone) === date);
  const totals = Object.fromEntries(Object.keys(NUTRIENTS).map((key) => {
    const nutrient = key as Nutrient;
    const known = meals.filter((p) => p.estimate!.nutrients[nutrient] !== null);
    return [key, { value: known.length ? Math.round(known.reduce((sum, p) => sum + p.estimate!.nutrients[nutrient]! * p.portion, 0) * 10) / 10 : null, knownMeals: known.length }];
  }));
  return { date, timezone, mealCount: meals.length, totals, coverage: "Logged meals only. Missing meals and missing nutrient values are unknown." };
}

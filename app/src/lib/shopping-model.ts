// Client-safe shapes and pure rules for the shopping list and the virtual
// pantry. The server module (shopping.ts) owns persistence; everything here is
// importable from the browser and unit-testable without a database.
//
// Alias resolution is driven only by data the user enters: each pantry item
// owns its name plus a list of aliases, and a term resolves to an item only on
// an exact match after normalisation. Normalisation folds case and spacing but
// keeps accents and plurals, because folding them merges distinct foods
// ("pâte" and "pâtes" are different things).
import { NUTRIENTS, type Nutrient } from "./food-model";

export const PANTRY_ITEMS = "users/local/pantryItems";
export const SHOPPING_LIST = "users/local/shoppingList";

export const CATEGORIES = [
  { id: "produce", label: "Fruit and vegetables" },
  { id: "dairy", label: "Dairy and alternatives" },
  { id: "meat-fish", label: "Meat, fish and eggs" },
  { id: "bakery", label: "Bread and bakery" },
  { id: "staples", label: "Pantry staples" },
  { id: "frozen", label: "Frozen" },
  { id: "drinks", label: "Drinks" },
  { id: "snacks", label: "Snacks" },
  { id: "household", label: "Household" },
  { id: "other", label: "Other" },
] as const;
export type Category = (typeof CATEGORIES)[number]["id"];

export const UNITS = ["unit", "pack", "g", "kg", "ml", "l"] as const;
export type Unit = (typeof UNITS)[number];

export const SOURCES = ["manual", "low-stock", "assistant", "recipe"] as const;
export type EntrySource = (typeof SOURCES)[number];

export const MAX_NAME = 120;
export const MAX_ALIASES = 20;
export const MAX_ALIAS = 60;
export const MAX_QUANTITY = 100_000;

/** Nutrient values per 100 g, per 100 ml or per unit, as the user entered them. */
export interface PantryNutrition {
  basis: "100g" | "100ml" | "unit";
  values: Partial<Record<Nutrient, number>>;
}

export interface PantryItem {
  id: string;
  name: string;
  aliases: string[];
  unit: Unit;
  category: Category;
  inStock: boolean;
  /** Quantity on hand in `unit`, or null when unknown. */
  quantity: number | null;
  /** Below this quantity the item counts as low stock. */
  minQuantity: number | null;
  nutrition: PantryNutrition | null;
  /** Local calendar date (YYYY-MM-DD) of the last "bought". */
  lastBoughtOn: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ShoppingEntry {
  id: string;
  /** Pantry item this entry refers to, or null for free text. */
  itemId: string | null;
  /** Display text: the item name when linked, otherwise what was typed. */
  text: string;
  quantity: number | null;
  unit: Unit | null;
  category: Category;
  checked: boolean;
  source: EntrySource;
  createdAt: string;
  updatedAt: string;
}

export class ShoppingError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export function normalizeTerm(value: string): string {
  return value.normalize("NFC").toLocaleLowerCase("fr").replace(/[\s_]+/g, " ").trim();
}

/** Looser key used only to suggest candidates, never to resolve. */
function looseKey(value: string): string[] {
  return normalizeTerm(value).normalize("NFD").replace(/\p{M}/gu, "")
    .split(/[^\p{L}\p{N}]+/u).filter(Boolean).map((word) => word.length > 3 ? word.replace(/s$/, "") : word);
}

export function itemTerms(item: Pick<PantryItem, "name" | "aliases">): string[] {
  return [item.name, ...item.aliases].map(normalizeTerm).filter(Boolean);
}

/** The item that already owns `term` (name or alias), ignoring `exceptId`. */
export function termOwner(items: PantryItem[], term: string, exceptId?: string): PantryItem | null {
  const key = normalizeTerm(term);
  if (!key) return null;
  return items.find((item) => item.id !== exceptId && itemTerms(item).includes(key)) ?? null;
}

export interface Resolution {
  term: string;
  item: PantryItem | null;
  via: "name" | "alias" | null;
  /** Items that share words with the term. Suggestions only; never applied silently. */
  candidates: PantryItem[];
}

export function resolveTerm(items: PantryItem[], term: string): Resolution {
  const key = normalizeTerm(term);
  const byName = items.find((item) => normalizeTerm(item.name) === key);
  if (byName) return { term, item: byName, via: "name", candidates: [] };
  const byAlias = items.find((item) => item.aliases.some((alias) => normalizeTerm(alias) === key));
  if (byAlias) return { term, item: byAlias, via: "alias", candidates: [] };
  const words = new Set(looseKey(term));
  const candidates = words.size
    ? items.filter((item) => [item.name, ...item.aliases].some((t) => looseKey(t).some((w) => words.has(w)))).slice(0, 5)
    : [];
  return { term, item: null, via: null, candidates };
}

export function isLowStock(item: PantryItem): boolean {
  if (!item.inStock) return true;
  return item.minQuantity !== null && item.quantity !== null && item.quantity < item.minQuantity;
}

export function categoryLabel(id: Category): string {
  return CATEGORIES.find((c) => c.id === id)?.label ?? "Other";
}

export interface EntryGroup { category: Category; label: string; entries: ShoppingEntry[] }

/** Groups in store order; unchecked entries first, then checked, each oldest first. */
export function groupEntries(entries: ShoppingEntry[]): EntryGroup[] {
  return CATEGORIES.map(({ id, label }) => ({
    category: id,
    label,
    entries: entries.filter((e) => (isCategory(e.category) ? e.category : "other") === id)
      .sort((a, b) => Number(a.checked) - Number(b.checked) || a.createdAt.localeCompare(b.createdAt)),
  })).filter((group) => group.entries.length > 0);
}

export function isCategory(value: unknown): value is Category {
  return CATEGORIES.some((c) => c.id === value);
}
export function isUnit(value: unknown): value is Unit {
  return UNITS.includes(value as Unit);
}

/** Converts between units of the same dimension; null when they differ. */
export function convertQuantity(quantity: number, from: Unit, to: Unit): number | null {
  if (from === to) return quantity;
  const scale: Partial<Record<Unit, [string, number]>> = { g: ["mass", 1], kg: ["mass", 1000], ml: ["volume", 1], l: ["volume", 1000] };
  const a = scale[from];
  const b = scale[to];
  if (!a || !b || a[0] !== b[0]) return null;
  return (quantity * a[1]) / b[1];
}

export interface ParsedLine { name: string; quantity: number | null; unit: Unit | null }

/**
 * Splits a pasted or typed line into items: commas, semicolons and new lines
 * separate items, and a leading amount is read as quantity ("2 avocados",
 * "500g rice", "1,5 l water").
 */
export function parseItems(text: string): ParsedLine[] {
  return text.split(/[\n;]|(?<!\d),|,(?!\d)/).map((part) => part.trim()).filter(Boolean).slice(0, 50).map((part) => {
    const match = part.match(/^(\d+(?:[.,]\d+)?)\s*(kg|g|ml|l|x)?\s+(.+)$/i);
    if (!match) return { name: part.slice(0, MAX_NAME), quantity: null, unit: null };
    const quantity = Number(match[1].replace(",", "."));
    const unit = match[2]?.toLowerCase();
    return {
      name: match[3].trim().slice(0, MAX_NAME),
      quantity: Number.isFinite(quantity) && quantity > 0 && quantity <= MAX_QUANTITY ? quantity : null,
      unit: unit && unit !== "x" && isUnit(unit) ? unit : null,
    };
  });
}

export function validateNutrition(value: unknown): PantryNutrition | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "object" || Array.isArray(value)) throw new ShoppingError("Nutrition must be an object");
  const v = value as Record<string, unknown>;
  if (v.basis !== "100g" && v.basis !== "100ml" && v.basis !== "unit") throw new ShoppingError("Nutrition basis must be 100g, 100ml or unit");
  const raw = (v.values ?? {}) as Record<string, unknown>;
  if (typeof raw !== "object" || Array.isArray(raw)) throw new ShoppingError("Nutrition values must be an object");
  const values: Partial<Record<Nutrient, number>> = {};
  for (const [key, n] of Object.entries(raw)) {
    if (!(key in NUTRIENTS)) throw new ShoppingError(`Unknown nutrient ${key}`);
    if (n === null) continue;
    if (typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > MAX_QUANTITY) throw new ShoppingError(`Invalid ${key} value`);
    values[key as Nutrient] = n;
  }
  return { basis: v.basis, values };
}

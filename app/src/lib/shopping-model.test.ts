import { describe, expect, it } from "vitest";
import { convertQuantity, groupEntries, isLowStock, normalizeTerm, parseItems, resolveTerm, termOwner, validateNutrition, type PantryItem, type ShoppingEntry } from "./shopping-model";

const item = (id: string, name: string, aliases: string[] = [], extra: Partial<PantryItem> = {}): PantryItem => ({
  id, name, aliases, unit: "unit", category: "other", inStock: true, quantity: null, minQuantity: null,
  nutrition: null, lastBoughtOn: null, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", ...extra,
});
const entry = (id: string, category: ShoppingEntry["category"], checked = false, createdAt = "2026-01-01T00:00:00.000Z"): ShoppingEntry => ({
  id, itemId: null, text: id, quantity: null, unit: null, category, checked, source: "manual", createdAt, updatedAt: createdAt,
});

const pantry = [
  item("a", "Item A", ["alias a"]),
  item("b", "Item B variant", ["alias b"]),
  item("c", "Pâte"),
];

describe("alias resolution", () => {
  it("resolves the default alias to the item the user attached it to", () => {
    expect(resolveTerm(pantry, "alias a")).toMatchObject({ item: { id: "a" }, via: "alias" });
  });
  it("resolves a longer term to a different item when that item owns it", () => {
    expect(resolveTerm(pantry, "Item B variant")).toMatchObject({ item: { id: "b" }, via: "name" });
  });
  it("ignores case and spacing but never guesses from partial overlap", () => {
    expect(resolveTerm(pantry, "  ALIAS   A ")).toMatchObject({ item: { id: "a" } });
    const partial = resolveTerm(pantry, "item b");
    expect(partial.item).toBeNull();
    expect(partial.candidates.map((c) => c.id)).toContain("b");
  });
  it("keeps accents and plurals distinct so different foods do not merge", () => {
    expect(resolveTerm(pantry, "Pâtes").item).toBeNull();
    expect(resolveTerm(pantry, "Pate").item).toBeNull();
    expect(resolveTerm(pantry, "pâte").item?.id).toBe("c");
  });
  it("prefers an exact item name over another item's alias", () => {
    const clash = [item("x", "Thing", ["word"]), item("y", "word")];
    expect(resolveTerm(clash, "word")).toMatchObject({ item: { id: "y" }, via: "name" });
  });
  it("reports which item already owns a term", () => {
    expect(termOwner(pantry, "ALIAS B")?.id).toBe("b");
    expect(termOwner(pantry, "alias b", "b")).toBeNull();
    expect(normalizeTerm(" A\tB ")).toBe("a b");
  });
});

describe("list grouping", () => {
  it("orders groups by store section and puts checked entries last", () => {
    const groups = groupEntries([
      entry("late", "dairy", false, "2026-01-03T00:00:00.000Z"),
      entry("done", "dairy", true, "2026-01-01T00:00:00.000Z"),
      entry("early", "dairy", false, "2026-01-02T00:00:00.000Z"),
      entry("fruit", "produce"),
      entry("odd", "nonsense" as ShoppingEntry["category"]),
    ]);
    expect(groups.map((g) => g.category)).toEqual(["produce", "dairy", "other"]);
    expect(groups[1].entries.map((e) => e.id)).toEqual(["early", "late", "done"]);
  });
});

describe("parsing and units", () => {
  it("splits pasted lists and reads leading quantities", () => {
    expect(parseItems("item a, 2 item b\n500g item c; 1,5 l item d,3 item e")).toEqual([
      { name: "item a", quantity: null, unit: null },
      { name: "item b", quantity: 2, unit: null },
      { name: "item c", quantity: 500, unit: "g" },
      { name: "item d", quantity: 1.5, unit: "l" },
      { name: "item e", quantity: 3, unit: null },
    ]);
  });
  it("converts within a dimension only", () => {
    expect(convertQuantity(1.5, "kg", "g")).toBe(1500);
    expect(convertQuantity(250, "ml", "l")).toBe(0.25);
    expect(convertQuantity(1, "kg", "l")).toBeNull();
    expect(convertQuantity(2, "unit", "g")).toBeNull();
  });
  it("flags out-of-stock and below-minimum items as low", () => {
    expect(isLowStock(item("o", "o", [], { inStock: false }))).toBe(true);
    expect(isLowStock(item("m", "m", [], { quantity: 1, minQuantity: 2 }))).toBe(true);
    expect(isLowStock(item("u", "u", [], { quantity: null, minQuantity: 2 }))).toBe(false);
  });
  it("accepts only known nutrients and non-negative values", () => {
    expect(validateNutrition({ basis: "100g", values: { protein: 10, calcium: null } })).toEqual({ basis: "100g", values: { protein: 10 } });
    expect(() => validateNutrition({ basis: "100g", values: { madeUp: 1 } })).toThrow("Unknown nutrient");
    expect(() => validateNutrition({ basis: "cup", values: {} })).toThrow("basis");
  });
});

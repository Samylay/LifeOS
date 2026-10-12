import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Throwaway DB before the lazy singleton opens (mirrors food-log.test.ts).
const directory = mkdtempSync(join(tmpdir(), "lifeos-shopping-test-"));
vi.stubEnv("LIFEOS_DB_PATH", join(directory, "test.db"));
const shopping = await import("./shopping");
const { listDocs, deleteDoc } = await import("./server-db");
const { PANTRY_ITEMS, SHOPPING_LIST } = await import("./shopping-model");
afterAll(() => { vi.unstubAllEnvs(); rmSync(directory, { recursive: true, force: true }); });

beforeEach(() => {
  for (const path of [PANTRY_ITEMS, SHOPPING_LIST]) for (const doc of listDocs(path)) deleteDoc(path, doc.id);
});

const line = (name: string, quantity: number | null = null, unit: "g" | "kg" | null = null) => ({ name, quantity, unit });

describe("pantry aliases", () => {
  it("links a list entry to the item that owns the alias", () => {
    const a = shopping.createPantryItem({ name: "Item A", aliases: ["alias a"], category: "dairy" });
    shopping.createPantryItem({ name: "alias a variant" });
    const [added] = shopping.addEntries([line("Alias A")]);
    expect(added).toMatchObject({ resolvedVia: "alias", entry: { itemId: a.id, text: "Item A", category: "dairy" } });
    expect(shopping.addEntries([line("alias a variant")])[0].entry.itemId).not.toBe(a.id);
  });

  it("refuses to give one alias to two items", () => {
    shopping.createPantryItem({ name: "Item A", aliases: ["alias a"] });
    const b = shopping.createPantryItem({ name: "Item B" });
    expect(() => shopping.updatePantryItem(b.id, { aliases: ["ALIAS A"] })).toThrow("already points to Item A");
    expect(() => shopping.createPantryItem({ name: "alias a" })).toThrow("already points");
  });

  it("drops duplicate aliases and an alias equal to the name", () => {
    const a = shopping.createPantryItem({ name: "Item A", aliases: ["x", "X ", "item a"] });
    expect(a.aliases).toEqual(["x"]);
  });
});

describe("list", () => {
  it("merges a repeat add into the open entry and sums compatible quantities", () => {
    shopping.createPantryItem({ name: "Item A", unit: "g" });
    shopping.addEntries([line("item a", 500, "g")]);
    const [again] = shopping.addEntries([line("Item A", 1, "kg")]);
    expect(again.merged).toBe(true);
    expect(again.entry.quantity).toBe(1500);
    expect(shopping.listEntries()).toHaveLength(1);
  });

  it("adds only low-stock items that are not already listed", () => {
    shopping.createPantryItem({ name: "Out", inStock: false });
    shopping.createPantryItem({ name: "Low", inStock: true, quantity: 1, minQuantity: 3 });
    shopping.createPantryItem({ name: "Fine", inStock: true, quantity: 5, minQuantity: 3 });
    expect(shopping.addLowStock().map((e) => e.text).sort()).toEqual(["Low", "Out"]);
    expect(shopping.addLowStock()).toEqual([]);
    expect(shopping.listEntries().every((e) => e.source === "low-stock")).toBe(true);
  });

  it("treats a checked entry as already listed", () => {
    shopping.createPantryItem({ name: "Out", inStock: false });
    const [entry] = shopping.addEntries([line("Out")]);
    shopping.setEntryChecked(entry.entry.id, true);
    expect(shopping.addLowStock()).toEqual([]);
  });
});

describe("bought flow", () => {
  it("moves checked entries into the pantry and off the list", () => {
    const a = shopping.createPantryItem({ name: "Item A", unit: "g", inStock: true, quantity: 200 });
    const [linked, free, unchecked] = shopping.addEntries([line("Item A", 1, "kg"), line("Item C", 2), line("Item D")]);
    shopping.setEntryChecked(linked.entry.id, true);
    shopping.setEntryChecked(free.entry.id, true);
    const results = shopping.buyEntries();
    expect(results.map((r) => [r.name, r.created]).sort()).toEqual([["Item A", false], ["Item C", true]]);
    const pantry = shopping.listPantry();
    expect(pantry.find((i) => i.id === a.id)).toMatchObject({ inStock: true, quantity: 1200 });
    expect(pantry.find((i) => i.name === "Item C")).toMatchObject({ inStock: true, quantity: 2, unit: "unit" });
    expect(pantry.every((i) => /^\d{4}-\d{2}-\d{2}$/.test(i.lastBoughtOn ?? ""))).toBe(true);
    expect(shopping.listEntries().map((e) => e.id)).toEqual([unchecked.entry.id]);
  });

  it("restarts the count when an out-of-stock item is bought", () => {
    const a = shopping.createPantryItem({ name: "Item A", inStock: false, quantity: 4 });
    shopping.buyByName([line("item a", 2)]);
    expect(shopping.listPantry().find((i) => i.id === a.id)).toMatchObject({ inStock: true, quantity: 2 });
  });

  it("buys by spoken name, clears the list entry, and asks instead of guessing", () => {
    // Distinct words per item: overlap on a shared word is what makes a name ambiguous.
    shopping.createPantryItem({ name: "Alpha", aliases: ["alias a"] });
    shopping.createPantryItem({ name: "Bravo variant" });
    shopping.addEntries([line("alias a")]);
    const [byAlias, ambiguous, fresh] = shopping.buyByName([line("alias a"), line("bravo"), line("Zulu")]);
    expect(byAlias).toMatchObject({ ok: true, created: false, item: { name: "Alpha" } });
    expect(ambiguous).toEqual({ ok: false, name: "bravo", candidates: ["Bravo variant"] });
    expect(fresh).toMatchObject({ ok: true, created: true, item: { name: "Zulu" } });
    expect(shopping.listEntries()).toHaveLength(0);
    expect(shopping.listPantry().map((i) => i.name)).toEqual(["Alpha", "Bravo variant", "Zulu"]);
  });

  it("keeps list entries as free text when their pantry item is deleted", () => {
    const a = shopping.createPantryItem({ name: "Item A" });
    shopping.addEntries([line("Item A")]);
    shopping.deletePantryItem(a.id);
    expect(shopping.listEntries()[0]).toMatchObject({ itemId: null, text: "Item A" });
  });
});

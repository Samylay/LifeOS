// Server-side shopping list and virtual pantry, stored in the local doc store
// (users/local/shoppingList and users/local/pantryItems). The API routes and
// the Assistant's chat tools both go through this module, so the alias rules
// and the "bought" flow behave the same everywhere.
import { createDoc, deleteDoc, getDoc, listDocs, runInTransaction, updateDoc } from "./server-db";
import { foodDate } from "./food-model";
import {
  PANTRY_ITEMS, SHOPPING_LIST, MAX_ALIAS, MAX_ALIASES, MAX_NAME, MAX_QUANTITY, ShoppingError,
  convertQuantity, isCategory, isLowStock, isUnit, normalizeTerm, resolveTerm, termOwner, validateNutrition,
  type Category, type EntrySource, type ParsedLine, type PantryItem, type Resolution, type ShoppingEntry, type Unit,
} from "./shopping-model";

const now = () => new Date().toISOString();
const today = () => foodDate(now(), process.env.BRIEF_TZ || "Europe/Paris");

function toItem(doc: Record<string, unknown> & { id: string }): PantryItem {
  return {
    id: doc.id,
    name: String(doc.name ?? ""),
    aliases: Array.isArray(doc.aliases) ? doc.aliases.filter((a): a is string => typeof a === "string") : [],
    unit: isUnit(doc.unit) ? doc.unit : "unit",
    category: isCategory(doc.category) ? doc.category : "other",
    inStock: doc.inStock === true,
    quantity: typeof doc.quantity === "number" ? doc.quantity : null,
    minQuantity: typeof doc.minQuantity === "number" ? doc.minQuantity : null,
    nutrition: (doc.nutrition as PantryItem["nutrition"]) ?? null,
    lastBoughtOn: typeof doc.lastBoughtOn === "string" ? doc.lastBoughtOn : null,
    createdAt: String(doc.createdAt ?? ""),
    updatedAt: String(doc.updatedAt ?? ""),
  };
}

function toEntry(doc: Record<string, unknown> & { id: string }): ShoppingEntry {
  return {
    id: doc.id,
    itemId: typeof doc.itemId === "string" ? doc.itemId : null,
    text: String(doc.text ?? ""),
    quantity: typeof doc.quantity === "number" ? doc.quantity : null,
    unit: isUnit(doc.unit) ? doc.unit : null,
    category: isCategory(doc.category) ? doc.category : "other",
    checked: doc.checked === true,
    source: (["manual", "low-stock", "assistant", "recipe"] as const).find((s) => s === doc.source) ?? "manual",
    createdAt: String(doc.createdAt ?? ""),
    updatedAt: String(doc.updatedAt ?? ""),
  };
}

export function listPantry(): PantryItem[] {
  return listDocs(PANTRY_ITEMS).map(toItem).sort((a, b) => a.name.localeCompare(b.name));
}
export function listEntries(): ShoppingEntry[] {
  return listDocs(SHOPPING_LIST).map(toEntry);
}
function getItem(id: string): PantryItem {
  const doc = getDoc(PANTRY_ITEMS, id);
  if (!doc) throw new ShoppingError("Pantry item not found", 404);
  return toItem(doc);
}
function getEntry(id: string): ShoppingEntry {
  const doc = getDoc(SHOPPING_LIST, id);
  if (!doc) throw new ShoppingError("List entry not found", 404);
  return toEntry(doc);
}

function cleanName(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new ShoppingError("Name is required");
  if (value.trim().length > MAX_NAME) throw new ShoppingError(`Name must be at most ${MAX_NAME} characters`);
  return value.trim().replace(/\s+/g, " ");
}
function cleanQuantity(value: unknown, label = "Quantity"): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > MAX_QUANTITY) throw new ShoppingError(`${label} must be between 0 and ${MAX_QUANTITY}`);
  return value;
}
function cleanAliases(value: unknown, name: string): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > MAX_ALIASES) throw new ShoppingError(`Use at most ${MAX_ALIASES} aliases`);
  const seen = new Set([normalizeTerm(name)]);
  const out: string[] = [];
  for (const alias of value) {
    if (typeof alias !== "string" || alias.trim().length > MAX_ALIAS) throw new ShoppingError(`Aliases must be text of at most ${MAX_ALIAS} characters`);
    const key = normalizeTerm(alias);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(alias.trim().replace(/\s+/g, " "));
  }
  return out;
}

/** A name or alias may point at only one item, so "milk" can never be ambiguous. */
function assertTermsFree(items: PantryItem[], terms: string[], exceptId?: string) {
  for (const term of terms) {
    const owner = termOwner(items, term, exceptId);
    if (owner) throw new ShoppingError(`"${term}" already points to ${owner.name}. Remove it there first.`, 409);
  }
}

export interface PantryInput {
  name?: unknown; aliases?: unknown; unit?: unknown; category?: unknown; inStock?: unknown;
  quantity?: unknown; minQuantity?: unknown; nutrition?: unknown;
}

export function createPantryItem(input: PantryInput): PantryItem {
  return runInTransaction(() => {
    const name = cleanName(input.name);
    const aliases = cleanAliases(input.aliases, name);
    assertTermsFree(listPantry(), [name, ...aliases]);
    if (input.unit !== undefined && !isUnit(input.unit)) throw new ShoppingError("Unknown unit");
    if (input.category !== undefined && !isCategory(input.category)) throw new ShoppingError("Unknown category");
    const stamp = now();
    const id = createDoc(PANTRY_ITEMS, {
      name, aliases,
      unit: (input.unit as Unit | undefined) ?? "unit",
      category: (input.category as Category | undefined) ?? "other",
      inStock: input.inStock === true,
      quantity: cleanQuantity(input.quantity),
      minQuantity: cleanQuantity(input.minQuantity, "Minimum quantity"),
      nutrition: validateNutrition(input.nutrition),
      lastBoughtOn: null,
      createdAt: stamp, updatedAt: stamp,
    });
    return getItem(id);
  });
}

export function updatePantryItem(id: string, input: PantryInput): PantryItem {
  return runInTransaction(() => {
    const current = getItem(id);
    const name = input.name !== undefined ? cleanName(input.name) : current.name;
    const aliases = input.aliases !== undefined ? cleanAliases(input.aliases, name) : current.aliases.filter((a) => normalizeTerm(a) !== normalizeTerm(name));
    assertTermsFree(listPantry(), [name, ...aliases], id);
    if (input.unit !== undefined && !isUnit(input.unit)) throw new ShoppingError("Unknown unit");
    if (input.category !== undefined && !isCategory(input.category)) throw new ShoppingError("Unknown category");
    if (input.inStock !== undefined && typeof input.inStock !== "boolean") throw new ShoppingError("inStock must be true or false");
    updateDoc(PANTRY_ITEMS, id, {
      name, aliases,
      ...(input.unit !== undefined ? { unit: input.unit } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.inStock !== undefined ? { inStock: input.inStock } : {}),
      ...(input.quantity !== undefined ? { quantity: cleanQuantity(input.quantity) } : {}),
      ...(input.minQuantity !== undefined ? { minQuantity: cleanQuantity(input.minQuantity, "Minimum quantity") } : {}),
      ...(input.nutrition !== undefined ? { nutrition: validateNutrition(input.nutrition) } : {}),
      updatedAt: now(),
    });
    // Keep linked list entries readable after a rename or recategorisation.
    for (const entry of listEntries().filter((e) => e.itemId === id)) {
      updateDoc(SHOPPING_LIST, entry.id, { text: name, category: input.category !== undefined ? input.category : current.category });
    }
    return getItem(id);
  });
}

export function deletePantryItem(id: string): void {
  runInTransaction(() => {
    getItem(id);
    // List entries survive as free text rather than pointing at nothing.
    for (const entry of listEntries().filter((e) => e.itemId === id)) updateDoc(SHOPPING_LIST, entry.id, { itemId: null });
    deleteDoc(PANTRY_ITEMS, id);
  });
}

export function resolve(term: string): Resolution {
  if (typeof term !== "string" || !term.trim()) throw new ShoppingError("Term is required");
  return resolveTerm(listPantry(), term.slice(0, MAX_NAME));
}

export interface AddedEntry { entry: ShoppingEntry; said: string; resolvedVia: Resolution["via"]; merged: boolean }

export function addEntries(lines: ParsedLine[], source: EntrySource = "manual", category?: Category): AddedEntry[] {
  if (!lines.length) throw new ShoppingError("Add at least one item");
  if (lines.length > 50) throw new ShoppingError("Add at most 50 items at once");
  if (category !== undefined && !isCategory(category)) throw new ShoppingError("Unknown category");
  return runInTransaction(() => {
    const pantry = listPantry();
    return lines.map((line) => {
      const said = cleanName(line.name);
      const quantity = cleanQuantity(line.quantity);
      if (line.unit !== null && line.unit !== undefined && !isUnit(line.unit)) throw new ShoppingError("Unknown unit");
      const unit = line.unit ?? null;
      const { item, via } = resolveTerm(pantry, said);
      const open = listEntries().find((e) => !e.checked && (item ? e.itemId === item.id : !e.itemId && normalizeTerm(e.text) === normalizeTerm(said)));
      if (open) {
        let merged = open.quantity;
        if (quantity !== null) {
          const converted = open.quantity !== null ? convertQuantity(quantity, unit ?? "unit", open.unit ?? "unit") : null;
          merged = converted !== null && open.quantity !== null ? open.quantity + converted : open.quantity ?? quantity;
        }
        updateDoc(SHOPPING_LIST, open.id, { quantity: merged, ...(open.quantity === null && unit ? { unit } : {}), updatedAt: now() });
        return { entry: getEntry(open.id), said, resolvedVia: via, merged: true };
      }
      const stamp = now();
      const id = createDoc(SHOPPING_LIST, {
        itemId: item?.id ?? null,
        text: item?.name ?? said,
        quantity, unit,
        category: item?.category ?? category ?? "other",
        checked: false, source, createdAt: stamp, updatedAt: stamp,
      });
      return { entry: getEntry(id), said, resolvedVia: via, merged: false };
    });
  });
}

/** Adds every low-stock or out-of-stock pantry item that is not already on the list. */
export function addLowStock(): ShoppingEntry[] {
  return runInTransaction(() => {
    const listed = new Set(listEntries().filter((e) => !e.checked && e.itemId).map((e) => e.itemId));
    const stamp = now();
    return listPantry().filter((item) => isLowStock(item) && !listed.has(item.id)).map((item) => {
      const id = createDoc(SHOPPING_LIST, {
        itemId: item.id, text: item.name, quantity: null, unit: null, category: item.category,
        checked: false, source: "low-stock", createdAt: stamp, updatedAt: stamp,
      });
      return getEntry(id);
    });
  });
}

export function setEntryChecked(id: string, checked: unknown): ShoppingEntry {
  if (typeof checked !== "boolean") throw new ShoppingError("checked must be true or false");
  return runInTransaction(() => {
    getEntry(id);
    updateDoc(SHOPPING_LIST, id, { checked, updatedAt: now() });
    return getEntry(id);
  });
}

export function removeEntry(id: string): void {
  runInTransaction(() => { getEntry(id); deleteDoc(SHOPPING_LIST, id); });
}

/** Restocks an item after a purchase: in stock, bought today, quantity added when the units allow it. */
function restock(item: PantryItem, quantity: number | null, unit: Unit | null): PantryItem {
  const converted = quantity !== null ? convertQuantity(quantity, unit ?? "unit", item.unit) : null;
  const base = item.inStock ? item.quantity : 0;
  const next = converted === null ? (item.inStock ? item.quantity : null) : base === null ? null : base + converted;
  updateDoc(PANTRY_ITEMS, item.id, { inStock: true, quantity: next, lastBoughtOn: today(), updatedAt: now() });
  return getItem(item.id);
}

export interface BoughtResult { name: string; item: PantryItem; created: boolean; entryId: string | null }

function createFromPurchase(name: string, unit: Unit | null, category: Category, quantity: number | null): PantryItem {
  const stamp = now();
  const id = createDoc(PANTRY_ITEMS, {
    name, aliases: [], unit: unit ?? "unit", category, inStock: true,
    quantity, minQuantity: null, nutrition: null,
    lastBoughtOn: today(), createdAt: stamp, updatedAt: stamp,
  });
  return getItem(id);
}

/**
 * The "Bought" flow for list entries: each entry moves into the pantry (its
 * linked item, an item its text now resolves to, or a new item named after
 * it) and leaves the list. Defaults to every checked entry.
 */
export function buyEntries(ids?: string[]): BoughtResult[] {
  return runInTransaction(() => {
    const entries = ids ? ids.map(getEntry) : listEntries().filter((e) => e.checked);
    return entries.map((entry) => {
      const pantry = listPantry();
      const linked = entry.itemId ? pantry.find((i) => i.id === entry.itemId) ?? null : null;
      const target = linked ?? resolveTerm(pantry, entry.text).item;
      const item = target ? restock(target, entry.quantity, entry.unit) : createFromPurchase(entry.text, entry.unit, entry.category, entry.quantity);
      deleteDoc(SHOPPING_LIST, entry.id);
      return { name: entry.text, item, created: !target, entryId: entry.id };
    });
  });
}

export type NamedPurchase =
  | ({ ok: true } & BoughtResult)
  | { ok: false; name: string; candidates: string[] };

/**
 * The "bought" flow from words ("I bought skyr and eggs"). A name that
 * resolves restocks its item and clears it from the list. A name that only
 * resembles existing items is not applied: the caller asks which one was
 * meant. A name with no match at all becomes a new pantry item.
 */
export function buyByName(lines: ParsedLine[]): NamedPurchase[] {
  if (!lines.length) throw new ShoppingError("Name at least one item");
  return runInTransaction(() => lines.map((line): NamedPurchase => {
    const name = cleanName(line.name);
    const quantity = cleanQuantity(line.quantity);
    const unit = line.unit && isUnit(line.unit) ? line.unit : null;
    const { item, candidates } = resolveTerm(listPantry(), name);
    if (!item && candidates.length) return { ok: false, name, candidates: candidates.map((c) => c.name) };
    const entry = listEntries().find((e) => !e.checked && (item ? e.itemId === item.id : !e.itemId && normalizeTerm(e.text) === normalizeTerm(name)))
      ?? listEntries().find((e) => item ? e.itemId === item.id : normalizeTerm(e.text) === normalizeTerm(name));
    if (entry) deleteDoc(SHOPPING_LIST, entry.id);
    const restocked = item ? restock(item, quantity, unit) : createFromPurchase(name, unit, entry?.category ?? "other", quantity);
    return { ok: true, name, item: restocked, created: !item, entryId: entry?.id ?? null };
  }));
}

export function shoppingState() {
  return { entries: listEntries(), pantry: listPantry() };
}

/** JSON error for the shopping and pantry routes: validation errors keep their status, anything else is a 500. */
export function shoppingErrorResponse(error: unknown): Response {
  if (error instanceof ShoppingError) return Response.json({ error: error.message }, { status: error.status });
  console.error("shopping route failed:", error);
  return Response.json({ error: "Shopping request failed" }, { status: 500 });
}

export async function readJsonBody(req: Request): Promise<Record<string, unknown>> {
  const body: unknown = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new ShoppingError("Send a JSON object");
  return body as Record<string, unknown>;
}

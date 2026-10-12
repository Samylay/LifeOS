"use client";

// Client hook for /shopping. Same shape as use-finance-burn.ts (fetch on
// mount, refresh when the tab becomes visible) plus the list and pantry
// mutations. Check, remove and stock toggles are optimistic because they are
// tapped many times per trip; add and "bought" wait for the server because
// it resolves aliases and moves items into the pantry.
import { useCallback, useEffect, useRef, useState } from "react";
import type { AddedEntry, BoughtResult } from "./shopping";
import type { PantryItem, ShoppingEntry } from "./shopping-model";

export type PantryPatch = Partial<Pick<PantryItem, "name" | "aliases" | "unit" | "category" | "inStock" | "quantity" | "minQuantity">>;

async function send<T>(url: string, method: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : `Request failed (${res.status})`);
  return data as T;
}

export function useShopping() {
  const [entries, setEntries] = useState<ShoppingEntry[]>([]);
  const [pantry, setPantry] = useState<PantryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const version = useRef(0);

  const load = useCallback(async () => {
    const current = ++version.current;
    try {
      const res = await fetch("/api/shopping");
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = (await res.json()) as { entries: ShoppingEntry[]; pantry: PantryItem[] };
      if (current !== version.current) return;
      setEntries(data.entries);
      setPantry(data.pantry);
      setError(null);
    } catch (err) {
      if (current === version.current) setError(err instanceof Error ? err.message : "Failed to load the list");
    } finally {
      if (current === version.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const onVisible = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  const add = useCallback(async (text: string) => {
    const { added } = await send<{ added: AddedEntry[] }>("/api/shopping", "POST", { text });
    version.current++;
    setEntries((prev) => [...prev.filter((e) => !added.some((a) => a.entry.id === e.id)), ...added.map((a) => a.entry)]);
    return added;
  }, []);

  const addLowStock = useCallback(async () => {
    const { added } = await send<{ added: AddedEntry[] }>("/api/shopping", "POST", { lowStock: true });
    version.current++;
    setEntries((prev) => [...prev, ...added.map((a) => a.entry)]);
    return added.length;
  }, []);

  const toggle = useCallback(async (entry: ShoppingEntry) => {
    version.current++;
    const flip = (checked: boolean) => setEntries((prev) => prev.map((e) => e.id === entry.id ? { ...e, checked } : e));
    flip(!entry.checked);
    try { await send("/api/shopping", "PATCH", { id: entry.id, checked: !entry.checked }); }
    catch (err) { flip(entry.checked); throw err; }
  }, []);

  const remove = useCallback(async (entry: ShoppingEntry) => {
    version.current++;
    setEntries((prev) => prev.filter((e) => e.id !== entry.id));
    try { await send("/api/shopping", "DELETE", { id: entry.id }); }
    catch (err) { setEntries((prev) => [...prev, entry]); throw err; }
  }, []);

  const bought = useCallback(async () => {
    const data = await send<{ bought: BoughtResult[]; entries: ShoppingEntry[]; pantry: PantryItem[] }>("/api/shopping/bought", "POST", {});
    version.current++;
    setEntries(data.entries);
    setPantry(data.pantry);
    return data.bought;
  }, []);

  const createItem = useCallback(async (fields: PantryPatch & { name: string }) => {
    const { item } = await send<{ item: PantryItem }>("/api/pantry", "POST", fields);
    version.current++;
    setPantry((prev) => [...prev, item].sort((a, b) => a.name.localeCompare(b.name)));
    return item;
  }, []);

  const updateItem = useCallback(async (item: PantryItem, patch: PantryPatch) => {
    version.current++;
    setPantry((prev) => prev.map((i) => i.id === item.id ? { ...i, ...patch } : i));
    try {
      const { item: saved } = await send<{ item: PantryItem }>("/api/pantry", "PATCH", { id: item.id, ...patch });
      setPantry((prev) => prev.map((i) => i.id === item.id ? saved : i));
      // A rename or recategorisation also rewrites linked list entries server-side.
      if (patch.name !== undefined || patch.category !== undefined) void load();
      return saved;
    } catch (err) {
      setPantry((prev) => prev.map((i) => i.id === item.id ? item : i));
      throw err;
    }
  }, [load]);

  const deleteItem = useCallback(async (item: PantryItem) => {
    await send("/api/pantry", "DELETE", { id: item.id });
    await load();
  }, [load]);

  return { entries, pantry, loading, error, refresh: load, add, addLowStock, toggle, remove, bought, createItem, updateItem, deleteItem };
}

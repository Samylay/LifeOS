"use client";

import { useState, type FormEvent } from "react";
import { ListPlus, Refrigerator } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/empty-state";
import { AddField } from "./shopping-list-panel";
import { CATEGORIES, UNITS, isLowStock, parseItems, type Category, type PantryItem, type Unit } from "@/lib/shopping-model";
import type { useShopping } from "@/lib/use-shopping";

type Shopping = ReturnType<typeof useShopping>;
const fail = (err: unknown) => toast.error(err instanceof Error ? err.message : "Something went wrong");
const selectClass = "min-h-11 w-full rounded-md border border-input bg-background px-3 text-base";

function boughtLabel(day: string | null) {
  if (!day) return null;
  return `bought ${new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}`;
}

function ItemEditor({ item, shopping, onClose }: { item: PantryItem; shopping: Shopping; onClose: () => void }) {
  const [name, setName] = useState(item.name);
  const [aliases, setAliases] = useState(item.aliases.join(", "));
  const [category, setCategory] = useState<Category>(item.category);
  const [unit, setUnit] = useState<Unit>(item.unit);
  const [min, setMin] = useState(item.minQuantity?.toString() ?? "");
  const [busy, setBusy] = useState(false);
  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const minQuantity = min.trim() === "" ? null : Number(min.replace(",", "."));
      await shopping.updateItem(item, { name, aliases: aliases.split(",").map((a) => a.trim()).filter(Boolean), category, unit, minQuantity });
      onClose();
    } catch (err) { fail(err); } finally { setBusy(false); }
  };
  const remove = async () => {
    setBusy(true);
    try { await shopping.deleteItem(item); toast.success(`Removed ${item.name} from the pantry`); } catch (err) { fail(err); setBusy(false); }
  };
  return <form onSubmit={save} className="enter grid gap-3 border-t border-border px-2 pt-3 pb-3">
    <label className="grid gap-1 text-sm">Name<Input value={name} onChange={(e) => setName(e.target.value)} className="h-11" /></label>
    <label className="grid gap-1 text-sm">Also called
      <Input value={aliases} onChange={(e) => setAliases(e.target.value)} placeholder="Comma-separated words" className="h-11" />
      <span className="text-xs text-muted-foreground">When you say one of these words, LifeOS means this item. A word can belong to one item only.</span>
    </label>
    <div className="grid grid-cols-2 gap-2">
      <label className="grid gap-1 text-sm">Section<select value={category} onChange={(e) => setCategory(e.target.value as Category)} className={selectClass}>{CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
      <label className="grid gap-1 text-sm">Unit<select value={unit} onChange={(e) => setUnit(e.target.value as Unit)} className={selectClass}>{UNITS.map((u) => <option key={u} value={u}>{u}</option>)}</select></label>
    </div>
    <label className="grid gap-1 text-sm">Low below<Input value={min} onChange={(e) => setMin(e.target.value)} inputMode="decimal" placeholder="No minimum" className="h-11" /></label>
    <div className="flex gap-2">
      <Button type="submit" size="lg" disabled={busy || !name.trim()} className="flex-1">Save</Button>
      <Button type="button" size="lg" variant="ghost" onClick={onClose}>Cancel</Button>
      <Button type="button" size="lg" variant="destructive" onClick={remove} disabled={busy}>Delete</Button>
    </div>
  </form>;
}

function PantryRow({ item, shopping, listed }: { item: PantryItem; shopping: Shopping; listed: boolean }) {
  const [editing, setEditing] = useState(false);
  const meta = [item.quantity !== null && item.inStock ? `${item.quantity} ${item.unit}` : null, item.aliases.length ? `also ${item.aliases.join(", ")}` : null, boughtLabel(item.lastBoughtOn)].filter(Boolean).join(" · ");
  return <li>
    <div className="flex items-center gap-1">
      <button type="button" aria-expanded={editing} onClick={() => setEditing((v) => !v)} className="flex min-h-12 min-w-0 flex-1 flex-col justify-center rounded-lg px-2 text-left transition-transform duration-[var(--dur-fast)] ease-[var(--ease-out-custom)] active:scale-[0.97]">
        <span className={`truncate text-[15px] ${item.inStock ? "" : "text-muted-foreground"}`}>{item.name}</span>
        {meta && <span className="truncate text-xs text-muted-foreground">{meta}</span>}
      </button>
      <Button variant={item.inStock ? (isLowStock(item) ? "outline" : "secondary") : "ghost"} size="sm" aria-pressed={item.inStock}
        aria-label={`${item.name}: ${item.inStock ? "in stock, tap to mark as out" : "out, tap to mark as in stock"}`}
        onClick={() => void shopping.updateItem(item, { inStock: !item.inStock }).catch(fail)} className="w-20">
        {item.inStock ? (isLowStock(item) ? "Low" : "In stock") : "Out"}
      </Button>
      <Button variant="ghost" size="icon-lg" aria-label={`Add ${item.name} to the list`} disabled={listed} className="text-muted-foreground"
        onClick={() => void shopping.add(item.name).then(() => toast.success(`${item.name} is on the list`)).catch(fail)}><ListPlus /></Button>
    </div>
    {editing && <ItemEditor item={item} shopping={shopping} onClose={() => setEditing(false)} />}
  </li>;
}

export function PantryPanel({ shopping }: { shopping: Shopping }) {
  const { pantry, entries } = shopping;
  const listed = new Set(entries.map((e) => e.itemId));
  const add = async (text: string) => {
    for (const line of parseItems(text)) await shopping.createItem({ name: line.name, inStock: true, ...(line.quantity !== null ? { quantity: line.quantity } : {}), ...(line.unit ? { unit: line.unit } : {}) });
  };
  const groups = CATEGORIES.map((c) => ({ ...c, items: pantry.filter((i) => i.category === c.id) })).filter((g) => g.items.length);
  return <div className="flex flex-col gap-4">
    <AddField onAdd={add} label="Add to the pantry" placeholder="Something you already have" />
    {groups.length === 0
      ? <EmptyState icon={Refrigerator} hint="The pantry fills itself when you tap Bought on the list. You can also add what you already have." />
      : groups.map((group, index) => <section key={group.id} aria-label={group.label} className="enter" style={{ ["--enter-delay" as string]: `${Math.min(index, 6) * 30}ms` }}>
        <h2 className="section-label mb-1 px-2">{group.label}</h2>
        <ul className="divide-y divide-border rounded-xl border border-border bg-card px-1">
          {group.items.map((item) => <PantryRow key={item.id} item={item} shopping={shopping} listed={listed.has(item.id)} />)}
        </ul>
      </section>)}
  </div>;
}

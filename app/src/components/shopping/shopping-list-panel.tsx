"use client";

import { useState, type FormEvent } from "react";
import { Check, Plus, ShoppingBasket, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/empty-state";
import { groupEntries, isLowStock, type PantryItem, type ShoppingEntry } from "@/lib/shopping-model";
import type { useShopping } from "@/lib/use-shopping";

type Shopping = ReturnType<typeof useShopping>;
const fail = (err: unknown) => toast.error(err instanceof Error ? err.message : "Something went wrong");

function amount(entry: ShoppingEntry) {
  if (entry.quantity === null) return null;
  return entry.unit && entry.unit !== "unit" ? `${entry.quantity} ${entry.unit}` : `× ${entry.quantity}`;
}

/** Fast add: one field takes a single item or a pasted list ("2 x, y, 500g z"). */
export function AddField({ onAdd, placeholder, label }: { onAdd: (text: string) => Promise<unknown>; placeholder: string; label: string }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    try { await onAdd(text); setText(""); } catch (err) { fail(err); } finally { setBusy(false); }
  };
  return <form onSubmit={submit} className="flex gap-2">
    <Input aria-label={label} value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} enterKeyHint="done" autoComplete="off" className="h-11" />
    <Button type="submit" size="lg" disabled={!text.trim() || busy}><Plus />Add</Button>
  </form>;
}

function EntryRow({ entry, onToggle, onRemove }: { entry: ShoppingEntry; onToggle: () => void; onRemove: () => void }) {
  const qty = amount(entry);
  return <li className="flex items-center gap-1">
    <button type="button" role="checkbox" aria-checked={entry.checked} onClick={onToggle}
      className="flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-lg px-2 text-left transition-transform duration-[var(--dur-fast)] ease-[var(--ease-out-custom)] active:scale-[0.97]">
      <span aria-hidden="true" className={`grid size-6 shrink-0 place-items-center rounded-full border-2 ${entry.checked ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>
        {entry.checked && <Check size={14} strokeWidth={3} />}
      </span>
      <span className={`min-w-0 flex-1 truncate text-[15px] ${entry.checked ? "text-muted-foreground line-through" : ""}`}>{entry.text}</span>
      {entry.source !== "manual" && <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{entry.source === "low-stock" ? "low" : entry.source}</span>}
      {qty && <span className="shrink-0 text-sm tabular-nums text-muted-foreground">{qty}</span>}
    </button>
    <Button variant="ghost" size="icon-lg" aria-label={`Remove ${entry.text}`} onClick={onRemove} className="text-muted-foreground"><X /></Button>
  </li>;
}

export function ShoppingListPanel({ shopping }: { shopping: Shopping }) {
  const { entries, pantry } = shopping;
  const [buying, setBuying] = useState(false);
  const groups = groupEntries(entries);
  const checked = entries.filter((e) => e.checked).length;
  const listed = new Set(entries.map((e) => e.itemId));
  const low = pantry.filter((item: PantryItem) => isLowStock(item) && !listed.has(item.id)).length;

  const add = async (text: string) => {
    const added = await shopping.add(text);
    const aliased = added.filter((a) => a.resolvedVia === "alias");
    if (aliased.length) toast.success(aliased.map((a) => `"${a.said}" → ${a.entry.text}`).join(", "));
  };
  const addLow = async () => {
    try { const n = await shopping.addLowStock(); toast.success(`Added ${n} low-stock item${n === 1 ? "" : "s"}`); } catch (err) { fail(err); }
  };
  const buy = async () => {
    setBuying(true);
    try {
      const done = await shopping.bought();
      const created = done.filter((d) => d.created).length;
      toast.success(`${done.length} item${done.length === 1 ? "" : "s"} moved to the pantry${created ? `, ${created} new` : ""}`);
    } catch (err) { fail(err); } finally { setBuying(false); }
  };

  return <div className="flex flex-col gap-4">
    <AddField onAdd={add} label="Add to the list" placeholder="2 avocados, rice, 1 l milk" />
    {low > 0 && <Button variant="outline" onClick={addLow} className="self-start">Add {low} running low</Button>}
    {groups.length === 0
      ? <EmptyState icon={ShoppingBasket} hint="Nothing on the list. Add items above, or tap Bought after a trip to fill the pantry." />
      : groups.map((group, index) => <section key={group.category} aria-label={group.label} className="enter" style={{ ["--enter-delay" as string]: `${Math.min(index, 6) * 30}ms` }}>
        <h2 className="section-label mb-1 px-2">{group.label}</h2>
        <ul className="divide-y divide-border rounded-xl border border-border bg-card px-1">
          {group.entries.map((entry) => <EntryRow key={entry.id} entry={entry}
            onToggle={() => void shopping.toggle(entry).catch(fail)}
            onRemove={() => void shopping.remove(entry).catch(fail)} />)}
        </ul>
      </section>)}
    {checked > 0 && <div className="enter sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] z-20 lg:bottom-4">
      <Button size="lg" onClick={buy} disabled={buying} className="h-12 w-full shadow-lg">
        Bought {checked} item{checked === 1 ? "" : "s"}
      </Button>
    </div>}
  </div>;
}

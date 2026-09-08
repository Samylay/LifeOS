"use client";

import { useMemo, useRef, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, ArrowLeftRight, Pencil, Search } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { formatMoney, SPENDING_CATEGORIES, type FinanceActivity, type SpendingCategory } from "@/lib/finance-activity";
import { monthLabel } from "./month-history";

function EditLabel({ item, close, refresh, returnFocus }: { item: FinanceActivity; close: () => void; refresh: () => Promise<void>; returnFocus: () => void }) {
  const [label, setLabel] = useState(item.label);
  const [category, setCategory] = useState<SpendingCategory>(SPENDING_CATEGORIES.includes(item.category as SpendingCategory) ? item.category as SpendingCategory : "Other");
  const [saving, setSaving] = useState(false);
  const save = async (clear = false) => {
    setSaving(true);
    try {
      const response = await fetch("/api/finance/labels", { method: clear ? "DELETE" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ transactionId: item.transactionId, label, category }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save label.");
      await refresh(); close(); toast.success(clear ? "Automatic label restored" : "Merchant label saved");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save label."); }
    finally { setSaving(false); }
  };
  return <Dialog open onOpenChange={(open) => { if (!open && !saving) close(); }}>
    <DialogContent onCloseAutoFocus={(event) => { event.preventDefault(); returnFocus(); }}>
      <DialogHeader><DialogTitle>Edit merchant label</DialogTitle><DialogDescription>Used for this merchant’s past and future transactions. Amounts stay as reported by your bank.</DialogDescription></DialogHeader>
      <form onSubmit={(event) => { event.preventDefault(); void save(); }} className="space-y-4">
        <label className="block space-y-1 text-sm">Name<Input autoFocus value={label} maxLength={100} onChange={(event) => setLabel(event.target.value)} /></label>
        {item.direction === "out" && !item.isTransfer && <label className="block space-y-1 text-sm">Category
          <select value={category} onChange={(event) => setCategory(event.target.value as SpendingCategory)} className="min-h-11 w-full rounded-md border border-input bg-background px-3 text-base">
            {SPENDING_CATEGORIES.map((value) => <option key={value}>{value}</option>)}
          </select>
        </label>}
        <p className="break-words text-xs text-muted-foreground">Bank description: {item.bankLabel}</p>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={saving || !label.trim()}>{saving ? "Saving…" : "Save label"}</Button>
          <Button type="button" variant="ghost" disabled={saving} onClick={close}>Cancel</Button>
          {item.corrected && <Button type="button" variant="outline" disabled={saving} onClick={() => void save(true)}>Reset label</Button>}
        </div>
      </form>
    </DialogContent>
  </Dialog>;
}

export function ActivityLedger({ activity, month, refresh }: { activity: FinanceActivity[]; month: string; refresh: () => Promise<void> }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [editing, setEditing] = useState<FinanceActivity | null>(null);
  const [limit, setLimit] = useState(30);
  const editTrigger = useRef<HTMLButtonElement | null>(null);
  const searchInput = useRef<HTMLInputElement | null>(null);
  const monthly = useMemo(() => activity.filter((item) => item.date?.startsWith(month)), [activity, month]);
  const breakdown = useMemo(() => {
    const totals = new Map<string, number>();
    for (const item of monthly) if (item.direction === "out" && !item.isTransfer && item.included && item.currency === "EUR") {
      totals.set(item.category, (totals.get(item.category) ?? 0) + Math.round(item.amount * 100));
    }
    return [...totals].sort((a, b) => b[1] - a[1]);
  }, [monthly]);
  const shown = monthly.filter((item) => (category === "All" || item.category === category) && `${item.label} ${item.bankLabel} ${item.category}`.toLowerCase().includes(query.trim().toLowerCase()));
  const total = breakdown.reduce((sum, [, cents]) => sum + cents, 0);
  return <>
    <Card className="gap-3 p-4">
      <div><h2 className="text-sm font-semibold">Where your money went</h2><p className="text-xs text-muted-foreground">{monthLabel(month)} · EUR spending · select a category to filter</p></div>
      {breakdown.length ? <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
        {breakdown.map(([name, cents]) => <button key={name} aria-pressed={category === name} onClick={() => { setCategory(category === name ? "All" : name); setLimit(30); }} className="min-h-11 space-y-1 rounded-md p-2 text-left transition-transform duration-150 ease-[var(--ease-out-custom)] hover:bg-muted active:scale-[0.97]">
          <span className="flex justify-between gap-2 text-sm"><span>{name}</span><span className="tabular-nums">{formatMoney(cents / 100)}</span></span>
          <span className="block h-1.5 overflow-hidden rounded bg-muted"><span className="block h-full origin-left rounded bg-chart-2" style={{ transform: `scaleX(${total ? cents / total : 0})` }} /></span>
        </button>)}
      </div> : <p className="text-sm text-muted-foreground">No EUR spending recorded for this month.</p>}
    </Card>
    <Card className="gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-semibold">Transactions · {monthLabel(month)}</h2><span className="text-xs text-muted-foreground">{shown.length} transaction{shown.length === 1 ? "" : "s"}</span></div>
      <div className="flex flex-wrap gap-2">
        <label className="relative min-w-0 basis-full sm:basis-auto flex-1"><Search aria-hidden size={15} className="absolute left-3 top-3.5 text-muted-foreground" /><Input ref={searchInput} aria-label="Search transactions" placeholder="Search merchant or description" value={query} onChange={(event) => { setQuery(event.target.value); setLimit(30); }} className="min-h-11 pl-9" /></label>
        <select aria-label="Filter transaction category" value={category} onChange={(event) => { setCategory(event.target.value); setLimit(30); }} className="min-h-11 max-w-full rounded-md border border-input bg-background px-3 text-base">
          {["All", ...SPENDING_CATEGORIES, "Income", "Transfer", "Needs review"].map((value) => <option key={value}>{value}</option>)}
        </select>
      </div>
      <p className="text-xs text-muted-foreground">Categories are suggested. Edit a label once to reuse it for this merchant.</p>
      {shown.slice(0, limit).map((item) => {
        const Icon = item.isTransfer ? ArrowLeftRight : item.direction === "in" ? ArrowDownLeft : ArrowUpRight;
        return <div key={item.transactionId} className="flex items-start gap-2 border-b border-border py-3 last:border-0">
          <span className="mt-1 rounded-full bg-muted p-2"><Icon aria-hidden size={14} /></span>
          <div className="min-w-0 flex-1">
            <p className="break-words text-sm font-medium">{item.label}</p>
            <p className="mt-1 text-xs text-muted-foreground">{item.date ? new Date(`${item.date}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }) : "Date unavailable"} · {item.category}{item.corrected ? " · Your label" : ""}</p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <span className="text-sm font-medium tabular-nums">{item.direction === "in" ? "+" : item.direction === "out" ? "−" : ""}{formatMoney(item.amount, item.currency)}</span>
            <Button variant="ghost" size="sm" aria-label={`Edit label for ${item.label}`} onClick={(event) => { editTrigger.current = event.currentTarget; setEditing(item); }}><Pencil size={12} /> Label</Button>
          </div>
        </div>;
      })}
      {!shown.length && <div className="space-y-2 py-4 text-sm text-muted-foreground"><p>{monthly.length ? "No transactions match these filters." : "No transactions recorded for this month."}</p>{(query || category !== "All") && <Button variant="outline" onClick={() => { setQuery(""); setCategory("All"); }}>Clear filters</Button>}</div>}
      {shown.length > limit && <Button variant="outline" onClick={() => setLimit(limit + 30)}>Show 30 more</Button>}
    </Card>
    {editing && <EditLabel key={editing.transactionId} item={editing} close={() => setEditing(null)} refresh={refresh} returnFocus={() => { if (editTrigger.current?.isConnected) editTrigger.current.focus(); else searchInput.current?.focus(); }} />}
  </>;
}

"use client";

import { useMemo, useRef, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, ArrowLeftRight, Pencil, Landmark } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { EmptyState } from "@/components/empty-state";
import { SourceAvatar } from "@/components/ui/avatar";
import { formatMoney, SPENDING_CATEGORIES, type FinanceActivity, type SpendingCategory } from "@/lib/finance-activity";

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
        {item.direction === "out" && !item.isTransfer && <label className="block space-y-1 text-sm">Category<select value={category} onChange={(event) => setCategory(event.target.value as SpendingCategory)} className="min-h-11 w-full rounded-md border border-input bg-background px-3 text-base">{SPENDING_CATEGORIES.map((value) => <option key={value}>{value}</option>)}</select></label>}
        <p className="break-words text-xs text-muted-foreground">Bank description: {item.bankLabel}</p>
        <div className="flex flex-wrap gap-2"><Button type="submit" disabled={saving || !label.trim()}>{saving ? "Saving…" : "Save label"}</Button><Button type="button" variant="ghost" disabled={saving} onClick={close}>Cancel</Button>{item.corrected && <Button type="button" variant="outline" disabled={saving} onClick={() => void save(true)}>Reset label</Button>}</div>
      </form>
    </DialogContent>
  </Dialog>;
}

function dateLabel(date: string) {
  const day = new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  return date === new Date().toISOString().slice(0, 10) ? `Today · ${day}` : day;
}

export function ActivityLedger({ activity, refresh }: { activity: FinanceActivity[]; refresh: () => Promise<void> }) {
  const [limit, setLimit] = useState(20);
  const [editing, setEditing] = useState<FinanceActivity | null>(null);
  const editTrigger = useRef<HTMLButtonElement | null>(null);
  const shown = useMemo(() => activity.filter((item) => !item.isTransfer).slice(0, limit), [activity, limit]);
  const groups = useMemo(() => {
    const dates = new Map<string, FinanceActivity[]>();
    for (const item of shown) {
      const key = item.date ?? "undated";
      dates.set(key, [...(dates.get(key) ?? []), item]);
    }
    return [...dates];
  }, [shown]);
  return <>
    <Card className="gap-3 p-4">
      <div className="flex items-center justify-between gap-3"><h2 className="text-sm font-semibold">Activity</h2><span className="text-xs tabular-nums text-muted-foreground">{shown.length} of {activity.length}</span></div>
      {groups.length ? <div>{groups.map(([date, items]) => <section key={date}>
        <h3 className="sticky top-0 border-b border-border bg-card py-2 text-xs font-medium text-muted-foreground">{date === "undated" ? "Date unavailable" : dateLabel(date)}</h3>
        {items.map((item) => {
          const Icon = item.isTransfer ? ArrowLeftRight : item.direction === "in" ? ArrowDownLeft : ArrowUpRight;
          return <div key={item.transactionId} className="flex items-center gap-2 border-b border-border/60 py-2.5 last:border-0">
            <SourceAvatar source={item.label} label={item.label} size="sm" className="shrink-0" />
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{item.label}</p><Badge variant="secondary" className="mt-1 max-w-full truncate px-1.5 py-0 text-xs font-normal">{item.category}</Badge></div>
            <div className="flex shrink-0 items-center gap-1"><Icon aria-hidden size={13} className="text-muted-foreground" /><span className="text-right text-sm tabular-nums">{item.direction === "in" ? "+" : item.direction === "out" ? "−" : ""}{formatMoney(item.amount, item.currency)}</span><Button ref={editTrigger} variant="ghost" size="icon-sm" aria-label={`Edit label for ${item.label}`} onClick={() => setEditing(item)} className="active:scale-[0.97]"><Pencil size={12} /></Button></div>
          </div>;
        })}
      </section>)}</div> : <EmptyState icon={Landmark} hint="Synced transactions will appear here, grouped by day." compact />}
      {activity.length > shown.length && <Button variant="outline" onClick={() => setLimit((current) => current + 20)} className="active:scale-[0.97]">Show more transactions</Button>}
    </Card>
    {editing && <EditLabel key={editing.transactionId} item={editing} close={() => setEditing(null)} refresh={refresh} returnFocus={() => editTrigger.current?.focus()} />}
  </>;
}

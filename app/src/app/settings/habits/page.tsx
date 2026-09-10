"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, Archive, Check, ListChecks, Loader2, Pause, Pencil, Play, Plus, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { useHabits, type HabitWithArea } from "@/lib/use-habits";
import { habitEdit, scheduleLabel, sortHabits, WEEKDAYS } from "@/lib/habit-schedule";
import { Page, PageHeader, FilterBar } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

type Schedule = "daily" | "weekly" | "custom";

function HabitEditor({ habit, save, cancel }: { habit: HabitWithArea | null; save: (edit: ReturnType<typeof habitEdit>) => Promise<void>; cancel: () => void }) {
  const [name, setName] = useState(habit?.name ?? "");
  const [schedule, setSchedule] = useState<Schedule>(habit?.daysOfWeek?.length ? "custom" : habit?.frequency ?? "daily");
  const [days, setDays] = useState<number[]>(habit?.daysOfWeek ?? [1, 2, 3, 4, 5]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  return <form className="flex min-h-0 flex-1 flex-col" onSubmit={async (event) => {
    event.preventDefault();
    if (saving) return;
    setError("");
    try { const edit = habitEdit(name, schedule, days); setSaving(true); await save(edit); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not save the habit."); }
    finally { setSaving(false); }
  }}>
    <SheetHeader>
      <SheetTitle>{habit ? "Edit habit" : "New habit"}</SheetTitle>
      <SheetDescription>{habit ? "Change the routine. Your past completions stay with it." : "Choose something you want to keep coming back to."}</SheetDescription>
    </SheetHeader>
    <fieldset disabled={saving} className="flex-1 space-y-6 overflow-y-auto p-4">
      <div className="space-y-2"><label htmlFor="habit-name" className="text-sm font-medium">Name</label>
        <Input id="habit-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="Read for 20 minutes" autoFocus required />
      </div>
      <div className="space-y-2"><p className="text-sm font-medium" id="schedule-label">When</p>
        <div role="group" aria-labelledby="schedule-label" className="grid gap-2">
          {([['daily', 'Every day'], ['weekly', 'Once a week'], ['custom', 'Selected days']] as const).map(([value, label]) =>
            <button type="button" key={value} aria-pressed={schedule === value} onClick={() => setSchedule(value)} className={cn("flex min-h-11 items-center justify-between rounded-lg border p-3 text-left text-sm pressable active:scale-[0.97]", schedule === value ? "border-primary bg-primary/10" : "border-border")}>
              {label}{schedule === value && <Check size={15} aria-hidden />}
            </button>)}
        </div>
        {schedule === "weekly" && <p className="text-xs text-muted-foreground">Complete it on any day, Monday through Sunday.</p>}
        {schedule === "custom" && <div role="group" aria-label="Scheduled days" className="flex flex-wrap gap-1 pt-2">
          {[1, 2, 3, 4, 5, 6, 0].map((day) => <Button type="button" key={day} size="sm" variant={days.includes(day) ? "default" : "outline"} aria-pressed={days.includes(day)} onClick={() => setDays((current) => current.includes(day) ? current.filter((d) => d !== day) : [...current, day])}>{WEEKDAYS[day]}</Button>)}
        </div>}
      </div>
      {habit && <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">{habit.history.filter((entry) => entry.completed).length} recorded completions. Editing this habit does not erase or rewrite them.</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </fieldset>
    <div className="flex justify-end gap-2 border-t border-border p-4">
      <Button type="button" variant="outline" onClick={cancel} disabled={saving}>Cancel</Button>
      <Button type="submit" disabled={saving}>{saving && <Loader2 size={15} className="animate-spin" />}{habit ? "Save changes" : "Add habit"}</Button>
    </div>
  </form>;
}

export default function HabitsSettingsPage() {
  const { habits, loading, error, createHabit, updateHabit } = useHabits();
  const [tab, setTab] = useState<"active" | "paused" | "archived">("active");
  const [editor, setEditor] = useState<HabitWithArea | null | undefined>();
  const [pending, setPending] = useState<Record<string, Partial<HabitWithArea>>>({});
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    setPending((current) => Object.fromEntries(Object.entries(current).filter(([id, patch]) => {
      const habit = habits.find((h) => h.id === id);
      return !habit || Object.entries(patch).some(([key, value]) => JSON.stringify(habit[key as keyof HabitWithArea]) !== JSON.stringify(value));
    })));
  }, [habits]);
  const visible = sortHabits(habits.map((h) => ({ ...h, ...pending[h.id] }))).filter((h) => (h.status ?? "active") === tab);
  const update = async (habit: HabitWithArea, patch: Partial<HabitWithArea>, message: string) => {
    if (busy) return;
    setBusy(habit.id);
    setPending((current) => ({ ...current, [habit.id]: patch }));
    try { await updateHabit(habit.id, patch); toast.success(message); }
    catch (e) { setPending((current) => { const next = { ...current }; delete next[habit.id]; return next; }); toast.error(e instanceof Error ? e.message : "Could not save the change."); }
    finally { setBusy(null); }
  };
  const move = (habit: HabitWithArea, index: number, direction: -1 | 1) => {
    const before = visible[index + (direction === -1 ? -2 : 1)];
    const after = visible[index + (direction === -1 ? -1 : 2)];
    const order = before && after ? (before.order! + after.order!) / 2 : before ? before.order! + 1 : after.order! - 1;
    void update(habit, { order }, "Habit order updated");
  };
  return <Page narrow>
    <Link href="/settings" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground pressable active:scale-[0.97]"><ArrowLeft size={14} /> Manage LifeOS</Link>
    <PageHeader title="Habits" kicker="Your routines" description="Make your daily list fit the way you live." icon={ListChecks} actions={<Button onClick={() => setEditor(null)}><Plus size={16} /> Add habit</Button>} />
    <FilterBar>{(["active", "paused", "archived"] as const).map((value) => <Button key={value} variant={tab === value ? "secondary" : "ghost"} aria-pressed={tab === value} onClick={() => setTab(value)} className="capitalize">{value}<span className="ml-1 text-xs text-muted-foreground">{habits.filter((h) => (pending[h.id]?.status ?? h.status ?? "active") === value).length}</span></Button>)}</FilterBar>
    {error ? <Card className="p-5 text-sm" role="alert">Could not load habits. Retrying automatically.</Card> : loading ? <p className="text-sm text-muted-foreground">Loading habits…</p> : visible.length === 0 ?
      <Card className="items-start p-6"><h2 className="font-medium">{tab === "active" ? "Make room for a routine" : `No ${tab} habits`}</h2><p className="text-sm text-muted-foreground">{tab === "active" ? "Add a habit, or bring one back from Paused or Archived." : "Your completion history stays intact when a habit moves here."}</p>{tab === "active" && <Button variant="outline" onClick={() => setEditor(null)}>Add your first habit</Button>}</Card> :
      <div className="space-y-2">{visible.map((habit, index) => <Card key={habit.id} className="gap-3 p-4">
        <div className="flex items-start gap-3"><div className="min-w-0 flex-1"><h2 className="break-words text-sm font-medium">{habit.name}</h2><p className="mt-1 text-xs text-muted-foreground">{scheduleLabel(habit)} · {habit.history.filter((entry) => entry.completed).length} completions</p></div>
          <Button variant="ghost" size="icon" aria-label={`Edit ${habit.name}`} onClick={() => setEditor(habit)} disabled={!!busy}><Pencil size={15} /></Button>
        </div>
        <div className="flex flex-wrap items-center gap-1 border-t border-border pt-2">
          {tab !== "archived" && <><Button variant="ghost" size="icon" disabled={index === 0 || !!busy} aria-label={`Move ${habit.name} up`} onClick={() => move(habit, index, -1)}><ArrowUp size={15} /></Button><Button variant="ghost" size="icon" disabled={index === visible.length - 1 || !!busy} aria-label={`Move ${habit.name} down`} onClick={() => move(habit, index, 1)}><ArrowDown size={15} /></Button></>}
          <div className="ml-auto flex gap-1">{tab === "archived" ? <Button variant="ghost" size="sm" disabled={!!busy} onClick={() => void update(habit, { status: "active" }, "Habit restored")}><RotateCcw size={14} /> Restore</Button> : <>
            <Button variant="ghost" size="sm" disabled={!!busy} onClick={() => void update(habit, { status: tab === "active" ? "paused" : "active" }, tab === "active" ? "Habit paused" : "Habit resumed")}>{tab === "active" ? <Pause size={14} /> : <Play size={14} />}{tab === "active" ? "Pause" : "Resume"}</Button>
            <Button variant="ghost" size="sm" disabled={!!busy} onClick={() => void update(habit, { status: "archived" }, "Habit archived. Restore it from Archived anytime.")}><Archive size={14} /> Archive</Button>
          </>}</div>
        </div>
      </Card>)}</div>}
    <Sheet open={editor !== undefined} onOpenChange={(open) => { if (!open) setEditor(undefined); }}>
      <SheetContent className="w-full sm:max-w-md">{editor !== undefined && <HabitEditor key={editor?.id ?? "new"} habit={editor} cancel={() => setEditor(undefined)} save={async (edit) => {
        if (editor) await updateHabit(editor.id, edit);
        else await createHabit({ ...edit, history: [], streak: 0, status: "active", order: Math.max(-1, ...habits.map((h) => h.order ?? 0)) + 1 });
        toast.success(editor ? "Habit updated" : "Habit added"); setEditor(undefined);
      }} />}</SheetContent>
    </Sheet>
  </Page>;
}

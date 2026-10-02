"use client";

import { useMemo, useState } from "react";
import { Dumbbell, Footprints, Loader2, Moon, StretchHorizontal, Watch } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { PHASE_LABEL, PLAN_WEEKS, TARGETS, planPosition, sessionsForWeek, type Session } from "@/lib/training-plan";

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const ICON = { gym: Dumbbell, run: Footprints, mobility: StretchHorizontal, rest: Moon } as const;

export function TrainingPlanCard() {
  const position = useMemo(() => planPosition(), []);
  const [selected, setSelected] = useState(position.state === "active" ? position.day : 0);
  const [sending, setSending] = useState(false);
  const sessions = useMemo(() => sessionsForWeek(position.week), [position.week]);
  const session: Session = sessions[selected];
  const Icon = ICON[session.kind];

  const sendToWatch = async () => {
    setSending(true);
    try {
      const res = await fetch("/api/garmin/workouts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ weeks: 2 }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't send runs to Garmin");
      toast.success(`${data.created.length} runs sent to Garmin, ${data.skipped.length} already there. They reach the watch on its next sync.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't send runs to Garmin");
    } finally {
      setSending(false);
    }
  };

  return (
    <Card className="space-y-4 p-4 lg:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">
          {position.state === "before" ? "Starts Mon 5 Oct: week 1" : position.state === "after" ? "Block complete" : `Week ${position.week} of ${PLAN_WEEKS}`}
          <span className="ml-2 font-normal text-muted-foreground">{PHASE_LABEL(position.week)}</span>
        </h2>
        <button type="button" onClick={() => void sendToWatch()} disabled={sending} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-muted px-3 text-xs font-medium transition-transform duration-150 ease-[var(--ease-out-custom)] active:scale-[0.97] disabled:opacity-40">
          {sending ? <Loader2 size={14} className="animate-spin" /> : <Watch size={14} />}Send runs to watch
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1.5" role="tablist" aria-label="Days of the week">
        {sessions.map((s, i) => {
          const DayIcon = ICON[s.kind];
          const today = position.state === "active" && i === position.day;
          return (
            <button key={i} type="button" role="tab" aria-selected={selected === i} onClick={() => setSelected(i)}
              className={`flex min-w-0 flex-col items-center gap-1 rounded-xl border px-1 py-2 text-[11px] transition-transform duration-150 ease-[var(--ease-out-custom)] active:scale-[0.97] ${selected === i ? "border-primary bg-primary/10" : "border-border"}`}>
              <span className={today ? "font-semibold text-primary" : "text-muted-foreground"}>{DAY_NAMES[i]}</span>
              <DayIcon size={16} className={s.kind === "rest" ? "text-muted-foreground" : ""} />
              <span className="w-full truncate text-center">{s.kind === "gym" ? s.title.replace("Gym ", "") : s.kind === "run" ? s.title.split(" ")[0] : s.title}</span>
            </button>
          );
        })}
      </div>

      <div className="rounded-xl border border-border p-4">
        <div className="flex items-center gap-2">
          <Icon size={18} className="text-primary" />
          <h3 className="text-base font-semibold">{DAY_NAMES[selected]}: {session.title}</h3>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{session.summary}</p>
        <ul className="mt-3 space-y-1.5 text-sm">
          {session.lines.map((line) => <li key={line} className="leading-5">{line}</li>)}
        </ul>
        {session.kind === "gym" && <p className="mt-3 text-xs text-muted-foreground">Short on time? A 10-minute session (top set of the first exercise plus one core finisher) counts.</p>}
      </div>

      <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
        {TARGETS.map((t) => (
          <div key={t.label} className="flex items-baseline justify-between gap-3 border-b border-border/60 py-1">
            <dt className="text-muted-foreground">{t.label}</dt>
            <dd className="tabular-nums">{t.start} <span className="text-muted-foreground">to</span> <span className="font-semibold">{t.goal}</span></dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-muted-foreground">Targets are due 31 January 2027, except the marathon on 4 April 2027. The lift numbers are estimates until the week 1 test.</p>
    </Card>
  );
}

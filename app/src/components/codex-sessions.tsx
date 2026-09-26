"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, LoaderCircle, Activity } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from "./ui/sheet";
import type { CodexSession } from "@/lib/codex-sessions";

export function CodexSessions() {
  const [sessions, setSessions] = useState<CodexSession[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("codexSession");
    setSelected(id);
    if (id) setOpen(true);
    const controller = new AbortController();
    const refresh = async () => {
      try {
        const response = await fetch(`/api/codex/sessions${id ? `?id=${encodeURIComponent(id)}` : ""}`, { signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not monitor Codex");
        setSessions(data.sessions);
        setError("");
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not monitor Codex");
      }
    };
    void refresh();
    const interval = window.setInterval(() => void refresh(), 4000);
    return () => { controller.abort(); window.clearInterval(interval); };
  }, []);
  const running = sessions.filter(session => session.status === "starting" || session.status === "running").length;
  return <Sheet open={open} onOpenChange={setOpen}>
    <SheetTrigger asChild><button type="button" aria-label={running ? `Agent activity, ${running} running` : "Agent activity"} className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm text-muted-foreground hover:bg-muted transition-transform duration-150 ease-[var(--ease-out-custom)] active:scale-[0.97]">
      {running ? <LoaderCircle size={18} className="animate-spin" /> : <Activity size={18} />}<span className="hidden sm:inline">Activity</span>{running > 0 && <span className="text-primary">{running}</span>}
    </button></SheetTrigger>
    <SheetContent side="bottom" className="mx-auto max-h-[85dvh] max-w-2xl rounded-t-2xl pb-[max(1rem,env(safe-area-inset-bottom))]">
      <SheetHeader><SheetTitle>Agent activity</SheetTitle><SheetDescription>{running ? `${running} running. Updates appear here as work progresses.` : "Recent sessions and their results."}</SheetDescription></SheetHeader>
      <div className="min-h-0 overflow-y-auto space-y-2 px-4">
    {!sessions.length && !error && <p className="py-6 text-sm text-muted-foreground">No sessions yet. Ask LifeOS to start work here.</p>}
    {error && <p role="status" className="text-xs text-destructive">{error}</p>}
    {sessions.map(session => {
      const active = session.status === "starting" || session.status === "running";
      const expanded = selected === session.id;
      return <div key={session.id} className="rounded-xl border border-border bg-card">
        <button type="button" aria-expanded={expanded} onClick={() => setSelected(expanded ? null : session.id)} className="flex w-full items-center gap-2 min-h-14 px-3 py-3 text-left text-sm transition-transform duration-150 ease-[var(--ease-out-custom)] active:scale-[0.97]">
          {active && <LoaderCircle size={13} className="animate-spin" />}
          <span className="flex-1 truncate font-medium">{session.title}</span>
          <span className={session.status === "failed" ? "text-destructive" : "text-muted-foreground"}>{active ? "Running" : session.status === "completed" ? "Turn finished" : "Failed"}</span>
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        {expanded && <div className="border-t border-border px-3 py-3 text-sm leading-6">
          <p className="text-muted-foreground">Session {session.id.slice(0, 8)}</p>
          <p className="whitespace-pre-wrap">{session.answer || session.error || session.progress.at(-1) || "Codex is starting."}</p>
        </div>}
      </div>;
    })}
  </div></SheetContent></Sheet>;
}

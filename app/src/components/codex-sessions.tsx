"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, LoaderCircle, Activity } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from "./ui/sheet";
import type { CodexSession } from "@/lib/codex-sessions";

function elapsed(session: CodexSession) {
  const start = new Date(session.startedAt || session.createdAt).getTime();
  const end = session.endedAt ? new Date(session.endedAt).getTime() : Date.now();
  const minutes = Math.max(0, Math.floor((end - start) / 60_000));
  return minutes < 1 ? "<1m" : `${minutes}m`;
}

function statusColor(status: CodexSession["status"]) {
  if (status === "failed") return "bg-destructive";
  if (status === "completed") return "bg-emerald-500";
  return "bg-primary";
}

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
    <SheetTrigger asChild><button type="button" aria-label={running ? `Recent runs, ${running} running` : "Recent runs"} className="flex min-h-11 max-w-[40vw] items-center gap-2 overflow-hidden rounded-lg px-2 text-xs text-muted-foreground hover:bg-muted transition-transform duration-150 ease-[var(--ease-out-custom)] active:scale-[0.97] sm:max-w-[34vw]">
      {!sessions.length ? <Activity size={17} className="shrink-0" /> : <span className="flex min-w-0 items-center gap-2 overflow-x-auto">
        {sessions.slice(0, 2).map((session) => <span key={session.id} title={`${session.title} · ${session.status} · ${elapsed(session)}`} className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border px-2 py-1"><span className={`size-1.5 rounded-full ${statusColor(session.status)} ${session.status === "running" || session.status === "starting" ? "animate-pulse" : ""}`} /><span className="max-w-20 truncate">{session.title}</span><span>{elapsed(session)}</span></span>)}
        {sessions.length > 2 && <span className="shrink-0">+{sessions.length - 2}</span>}
      </span>}
      <span className="hidden shrink-0 sm:inline">Recent runs</span>{running > 0 && <span className="shrink-0 text-primary">{running}</span>}
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
          <span className={session.status === "failed" ? "text-destructive" : "text-muted-foreground"}>{active ? `Running · ${elapsed(session)}` : `${session.status === "completed" ? "Done" : "Failed"} · ${elapsed(session)}`}</span>
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

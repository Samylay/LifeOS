"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, LoaderCircle } from "lucide-react";
import type { CodexSession } from "@/lib/codex-sessions";

export function CodexSessions() {
  const [sessions, setSessions] = useState<CodexSession[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("codexSession");
    setSelected(id);
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
  if (!sessions.length && !error) return null;
  return <div className="shrink-0 space-y-2 border-b border-border py-3">
    {error && <p role="status" className="text-xs text-destructive">{error}</p>}
    {sessions.slice(0, 3).map(session => {
      const active = session.status === "starting" || session.status === "running";
      const expanded = selected === session.id;
      return <div key={session.id} className="rounded-xl border border-border bg-card">
        <button type="button" aria-expanded={expanded} onClick={() => setSelected(expanded ? null : session.id)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-transform duration-150 ease-[var(--ease-out-custom)] active:scale-[0.97]">
          {active && <LoaderCircle size={13} className="animate-spin" />}
          <span className="flex-1 truncate font-medium">{session.title}</span>
          <span className={session.status === "failed" ? "text-destructive" : "text-muted-foreground"}>{active ? "Running" : session.status === "completed" ? "Turn finished" : "Failed"}</span>
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        {expanded && <div className="max-h-52 overflow-y-auto border-t border-border px-3 py-2 text-xs leading-6">
          <p className="text-muted-foreground">Session {session.id.slice(0, 8)}</p>
          <p className="whitespace-pre-wrap">{session.answer || session.error || session.progress.at(-1) || "Codex is starting."}</p>
        </div>}
      </div>;
    })}
  </div>;
}

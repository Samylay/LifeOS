"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Check, Clock3, FileText, FlaskConical, Inbox, RefreshCw, Tag, Workflow, X } from "lucide-react";
import { ProgressBar } from "@/components/charts";
import { Page, PageHeader } from "@/components/ui/page";
import { EmptyState } from "@/components/empty-state";
import { CardStack, type DeckAction } from "@/components/decide/card-stack";
import { TriageCard, type TriageQueueItem } from "@/components/decide/triage-card";
import { ProposalCard } from "@/components/decide/proposal-card";
import { DecisionCard } from "@/components/decide/decision-card";
import { ResultCard } from "@/components/workflows/result-card";
import type { DecisionItem } from "@/lib/decisions";
import type { Proposal } from "@/lib/proposals";
import { post } from "@/lib/decide/post";
import { plainTitle } from "@/lib/decide/plain-text";
import { capSavedItems, SAVED_LIMIT, type SavedInboxItem } from "@/lib/decide/inbox-cap";
import { isPerformable, proposedAction, type Action } from "@/lib/decide/homelab-actions";
import { STATE_LABEL, type WorkflowRun } from "@/lib/workflows/model";
import { cn } from "@/lib/utils";

type Tab = "all" | "saved" | "agents" | "results";
type ExtractData = { groups: { id: string; title: string; items: { title: string; state: string; summary: string; source?: string; session?: string }[] }[]; rulings: { title: string; state: string; summary: string; source?: string }[] };
type DispatchItem = { id: string; title: string; url: string; filedAt?: { __date?: string } | string };
type SavedItem = (TriageQueueItem & { type: "triage" }) | (Proposal & { type: "proposal"; id: string });
type Entry =
  | { id: string; group: "saved"; kind: "triage"; title: string; subtitle: string; age: string; source: string; item: TriageQueueItem }
  | { id: string; group: "saved"; kind: "proposal"; title: string; subtitle: string; age: string; source: string; item: Proposal }
  | { id: string; group: "agents"; kind: "agent"; title: string; subtitle: string; age: string; source: string; item: DecisionItem }
  | { id: string; group: "results"; kind: "workflow"; title: string; subtitle: string; age: string; source: string; item: WorkflowRun }
  | { id: string; group: "results"; kind: "extract" | "dispatch"; title: string; subtitle: string; age: string; source: string; item: { title: string; state: string; summary: string; source?: string } };

const tabs: { id: Tab; label: string }[] = [{ id: "all", label: "All" }, { id: "saved", label: "Saved" }, { id: "agents", label: "Approvals" }, { id: "results", label: "Finished" }];
const RESULTS_LIMIT = 10;
const actions: DeckAction[] = [
  { id: "discard", label: "Discard", icon: X, direction: "left", tone: "danger" },
  { id: "defer", label: "Defer", icon: Clock3, direction: "none", tone: "neutral" },
  { id: "approve", label: "Approve", icon: Check, direction: "right", tone: "success" },
];
const actionClass = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border px-3 text-sm transition-transform duration-[var(--dur-fast)] ease-[var(--ease-out-custom)] active:scale-[0.97]";
const asDate = (v: unknown): number | null => { const iso = typeof v === "string" ? v : v && typeof v === "object" && "__date" in v ? String((v as { __date?: string }).__date ?? "") : ""; const n = Date.parse(iso); return Number.isFinite(n) ? n : null; };
const ageLabel = (value: unknown) => { const ms = asDate(value); if (ms === null) return ""; const days = Math.max(0, Math.floor((Date.now() - ms) / 86400000)); return days === 0 ? "Today" : days === 1 ? "1d" : `${days}d`; };

export default function DecidePage() {
  return <Suspense fallback={<div className="page"><div className="shimmer h-16 rounded-xl bg-card" /></div>}><InboxContent /></Suspense>;
}

function InboxContent() {
  const params = useSearchParams();
  const requested = params.get("tab");
  const requestedItem = params.get("item");
  const [tab, setTab] = useState<Tab>(tabs.some((t) => t.id === requested) ? requested as Tab : "all");
  const [triage, setTriage] = useState<TriageQueueItem[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [decisions, setDecisions] = useState<DecisionItem[]>([]);
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [extracts, setExtracts] = useState<ExtractData | null>(null);
  const [dispatch, setDispatch] = useState<DispatchItem[]>([]);
  const [missions, setMissions] = useState<Record<string, string>>({});
  const [overrides, setOverrides] = useState<Record<string, Action>>({});
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [auxFailed, setAuxFailed] = useState(false);
  const [automaticReferences, setAutomaticReferences] = useState(false);

  const refresh = useCallback(async () => {
    const get = async (url: string) => { try { const r = await fetch(url); return r.ok ? await r.json() : null; } catch { return null; } };
    try {
      const [t, a, p, w, e, d] = await Promise.all([
        get("/api/triage/queue"), get("/api/decide/queue"), get("/api/proposals"),
        get("/api/workflows"), get("/api/decide/extracts"), get("/api/triage/dispatchable"),
      ]);
      if (!t || !a || !p || !w) throw new Error("Core inbox data unavailable");
      setAutomaticReferences(t.referenceMode === "automatic"); setTriage(t.referenceMode === "automatic" ? [] : t.items ?? []); setDecisions(a.items ?? []); setProposals(p.items ?? []); setRuns(w.runs ?? []); setExtracts(e); setDispatch(d?.items ?? []); setAuxFailed(!e || !d); setFailed(false);
    } catch { setFailed(true); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { queueMicrotask(() => void refresh()); }, [refresh]);
  useEffect(() => { const onVis = () => { if (document.visibilityState === "visible") void refresh(); }; document.addEventListener("visibilitychange", onVis); return () => document.removeEventListener("visibilitychange", onVis); }, [refresh]);

  const saved = useMemo(() => {
    const rows: SavedItem[] = [
      ...triage.map((item) => ({ ...item, type: "triage" as const })),
      ...proposals.map((item) => ({ ...item, type: "proposal" as const, id: item.id })),
    ];
    return capSavedItems(rows as (SavedItem & SavedInboxItem)[]);
  }, [triage, proposals]);
  const entries = useMemo<Entry[]>(() => {
    const savedEntries: Entry[] = saved.visible.map((row) => row.type === "triage"
      ? { id: row.id, group: "saved", kind: "triage", title: row.proposal?.title || row.proposal?.summary || row.url, subtitle: row.source, age: ageLabel(row.savedAt), source: row.source, item: row }
      : { id: row.id, group: "saved", kind: "proposal", title: `${row.kind === "tag" ? "Tag" : "Topic"}: ${row.tag}`, subtitle: row.kind === "topic" ? `${row.count} saved items` : "Suggested tag", age: "", source: "Saved", item: row });
    const agentEntries: Entry[] = decisions.map((item) => ({ id: `agent:${item.id}`, group: "agents", kind: "agent", title: plainTitle(item.title), subtitle: item.project, age: ageLabel((item as DecisionItem & { createdAt?: unknown }).createdAt), source: item.project, item }));
    const resultEntries: Entry[] = [
      ...runs.map((item) => ({ id: `run:${item.id}`, group: "results" as const, kind: "workflow" as const, title: item.title, subtitle: STATE_LABEL[item.state], age: ageLabel(item.updatedAt), source: "Workflow", item })),
      ...(extracts?.groups.flatMap((group) => group.items.map((item, i) => ({ id: `extract:${group.id}:${i}`, group: "results" as const, kind: "extract" as const, title: item.title, subtitle: `${group.title} · ${item.state}`, age: "", source: item.source || "Extract", item }))) ?? []),
      ...dispatch.map((item) => ({ id: `dispatch:${item.id}`, group: "results" as const, kind: "dispatch" as const, title: item.title, subtitle: "Ready to dispatch", age: ageLabel(item.filedAt), source: "Dispatch", item: { title: item.title, state: "Ready", summary: item.url, source: item.url } })),
    ];
    // Approvals and saved sources first; tag and topic chores last; finished work at the end.
    return [...agentEntries, ...savedEntries.filter((e) => e.kind === "triage"), ...savedEntries.filter((e) => e.kind === "proposal"), ...resultEntries.slice(0, RESULTS_LIMIT)];
  }, [saved, decisions, runs, extracts, dispatch]);
  const filtered = entries.filter((entry) => tab === "all" || entry.group === tab);
  const selected = filtered.find((entry) => entry.id === selectedId) ?? filtered[0];
  useEffect(() => {
    if (!requestedItem) return;
    const match = entries.find((entry) => entry.id === requestedItem || entry.id === `run:${requestedItem}` || entry.id === `agent:${requestedItem}` || entry.id.endsWith(`:${requestedItem}`));
    if (match) setSelectedId(match.id);
  }, [requestedItem, entries]);
  useEffect(() => { if (selected && selected.id !== selectedId) setSelectedId(selected.id); }, [selected, selectedId]);
  const counts = { all: entries.length, saved: saved.visible.length, agents: decisions.length, results: entries.filter((e) => e.group === "results").length };

  const actionFor = useCallback((item: TriageQueueItem) => {
    const action = overrides[item.id] ?? (/^https?:\/\//i.test(item.url) ? { id: "homelab-develop", params: {} } as const : proposedAction(item));
    return action && isPerformable(action) ? action : null;
  }, [overrides]);
  const decideSaved = useCallback(async (entry: Extract<Entry, { group: "saved" }>, actionId: string) => {
    if (entry.kind === "triage") {
      if (actionId === "defer") await post("/api/triage/defer", { id: entry.item.id });
      else { const action = actionId === "discard" ? { id: "discard", params: {} } as const : actionFor(entry.item); if (!action) throw new Error("Choose a destination first."); await post("/api/triage/decide", { id: entry.item.id, action: action.id, params: action.params }); }
    } else {
      const mission = missions[entry.item.id] || "";
      if (actionId === "approve" && entry.item.kind === "topic" && !mission.trim()) throw new Error("Write what you want to learn before accepting.");
      await post("/api/proposals/verdict", { id: entry.item.id, action: actionId === "discard" ? "never" : "accept", mission: entry.item.kind === "topic" ? mission : undefined });
    }
    await refresh();
  }, [actionFor, missions, refresh]);
  const decideAgent = useCallback(async (item: DecisionItem, verdict: string) => { await post("/api/decide/verdict", { id: item.id, verdict }); await refresh(); }, [refresh]);
  const decideWorkflow = useCallback(async (run: WorkflowRun, action: string) => { const response = await fetch("/api/workflows", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: run.id, action, reportHash: run.reportHash }) }); if (!response.ok) throw new Error((await response.json()).error || "Workflow action failed"); await refresh(); }, [refresh]);
  const startWorkflow = useCallback(async (itemId: string) => {
    try {
      const response = await fetch("/api/workflows", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "start", itemId, kind: "auto" }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not start workflow");
      await refresh();
      setTab("results");
      setSelectedId(`run:${data.run.id}`);
      toast.success("Workflow started");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not start workflow"); }
  }, [refresh]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (document.documentElement.clientWidth < 1024 || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return;
      if (event.key === "j" || event.key === "k") {
        event.preventDefault();
        const index = filtered.findIndex((entry) => entry.id === selected?.id);
        const next = Math.min(filtered.length - 1, Math.max(0, index + (event.key === "j" ? 1 : -1)));
        if (filtered[next]) setSelectedId(filtered[next].id);
      } else if (event.key === "Enter" && selected) {
        document.querySelector<HTMLElement>("[aria-live='polite']")?.focus();
      } else if (selected?.group === "saved" && selected.kind === "triage") {
        if (event.key === "a") void decideSaved(selected, "approve");
        if (event.key === "d") void decideSaved(selected, "defer");
        if (event.key === "x") void decideSaved(selected, "discard");
      } else if (selected?.kind === "agent") {
        if (event.key === "a") void decideAgent(selected.item, "approved");
        if (event.key === "d") void decideAgent(selected.item, "deferred");
        if (event.key === "x") void decideAgent(selected.item, "rejected");
      } else if (selected?.kind === "workflow" && selected.item.state === "ready" && event.key === "a") {
        void decideWorkflow(selected.item, "approve");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [filtered, selected, decideSaved, decideAgent, decideWorkflow]);

  const renderDetail = (entry: Entry) => <div className="min-w-0 space-y-4" key={entry.id}>
    {entry.kind === "triage" && <><TriageCard item={entry.item} action={actionFor(entry.item)} onChangeAction={(action) => setOverrides((old) => ({ ...old, [entry.item.id]: action }))} onFeedback={() => void refresh()} onStartWorkflow={() => void startWorkflow(entry.item.id)} />{entry.item.evidenceRef && <a className={actionClass} href={`/decide/sources/${encodeURIComponent(entry.item.id)}`}>Read extracted evidence</a>}</>}
    {entry.kind === "proposal" && <><ProposalCard item={entry.item} mission={missions[entry.item.id] || ""} onMissionChange={(value) => setMissions((old) => ({ ...old, [entry.item.id]: value }))} /><div className="flex gap-2"><button className={actionClass} onClick={() => void decideSaved(entry, "discard")}>Don&apos;t suggest</button><button className={`${actionClass} bg-primary text-primary-foreground`} onClick={() => void decideSaved(entry, "approve")}>{entry.item.kind === "tag" ? "Add tag" : "Start topic"}</button></div></>}
    {entry.kind === "agent" && <><DecisionCard item={entry.item} /><div className="flex flex-wrap gap-2 px-4 pb-4"><button className={actionClass} onClick={() => void decideAgent(entry.item, "rejected")}>Reject</button><button className={actionClass} onClick={() => void decideAgent(entry.item, "deferred")}>Defer</button><button className={`${actionClass} bg-primary text-primary-foreground`} onClick={() => void decideAgent(entry.item, "approved")}>Approve</button><kbd className="hidden self-center text-xs text-muted-foreground xl:inline">a approve · d defer · x reject</kbd></div></>}
    {entry.kind === "workflow" && <><ResultCard run={entry.item} />{entry.item.state === "ready" && <div className="flex gap-2"><button className={actionClass} onClick={() => void decideWorkflow(entry.item, "dismiss")}>Dismiss</button><button className={`${actionClass} bg-primary text-primary-foreground`} onClick={() => void decideWorkflow(entry.item, "approve")}>Approve result</button></div>}{entry.item.state === "blocked" && entry.item.phase === "evaluate" && <button className={actionClass} onClick={() => void decideWorkflow(entry.item, "retry")}>Retry</button>}</>}
    {(entry.kind === "extract" || entry.kind === "dispatch") && <article className="rounded-2xl border border-border bg-card p-5"><span className="text-xs text-muted-foreground">{entry.subtitle}</span><h2 className="mt-3 text-xl font-semibold">{entry.item.title}</h2><p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{entry.item.summary}</p>{entry.item.source && <a href={entry.item.source} target="_blank" rel="noreferrer" className={`${actionClass} mt-4`}>Open source</a>}</article>}
  </div>;

  const mobileSaved: SavedItem[] = saved.visible;
  const savedActions: DeckAction[] = [actions[0], actions[1], { ...actions[2], label: "Accept / approve" }];

  return <Page className="max-w-7xl">
    <PageHeader title="Inbox" icon={Inbox} actions={<><Link href="/saved" className={actionClass}>Saved library</Link><button className={actionClass} onClick={() => void refresh()} aria-label="Refresh inbox"><RefreshCw size={15} />Refresh</button></>} />
    <div className="flex gap-1 overflow-x-auto rounded-xl border border-border bg-muted/50 p-1" role="tablist" aria-label="Inbox groups">
      {tabs.map((item) => <button key={item.id} role="tab" aria-selected={tab === item.id} onClick={() => { setTab(item.id); window.history.replaceState(null, "", item.id === "all" ? "/decide" : `/decide?tab=${item.id}`); }} className={cn("min-h-10 shrink-0 rounded-lg px-3 text-sm transition-transform duration-[var(--dur-fast)] ease-[var(--ease-out-custom)] active:scale-[0.97]", tab === item.id ? "bg-surface-3 text-foreground shadow-card" : "text-muted-foreground hover:text-foreground")}>{item.label}<span className="ml-1.5 text-xs text-primary">{counts[item.id]}</span></button>)}
    </div>
    {!automaticReferences && (tab === "all" || tab === "saved") && <ProgressBar value={saved.visible.length} max={SAVED_LIMIT} label="Saved items today" showValue valueFormatter={(value, max) => `${value}/${max}`} className="max-w-sm" />}
    {auxFailed && tab === "results" && <p role="status" className="text-xs text-muted-foreground">Some result sources are unavailable. <button className="underline" onClick={() => void refresh()}>Retry</button></p>}
    {saved.capped + saved.expired > 0 && (tab === "all" || tab === "saved") && <p className="text-xs text-muted-foreground">{saved.capped + saved.expired} older items hidden</p>}
    {loading ? <div className="grid gap-4 lg:grid-cols-[minmax(320px,0.9fr)_minmax(0,1.5fr)]"><div className="shimmer h-80 rounded-xl bg-card"/><div className="shimmer h-80 rounded-xl bg-card"/></div> : failed ? <div role="alert" className="rounded-xl border border-warning/30 p-5 text-sm">Couldn&apos;t load the inbox. <button className="underline" onClick={() => void refresh()}>Retry</button></div> : filtered.length === 0 ? <EmptyState icon={Check} title="Inbox zero" hint="Nothing is waiting for your verdict." success /> : <>
      <div className="hidden min-h-[68vh] gap-4 lg:grid lg:grid-cols-[minmax(320px,0.9fr)_minmax(0,1.5fr)]">
        <nav aria-label="Inbox items" className="max-h-[74vh] space-y-1 overflow-y-auto rounded-xl border border-border bg-card p-2">
          {filtered.map((entry) => <button key={entry.id} aria-current={selected?.id === entry.id ? "true" : undefined} onClick={() => setSelectedId(entry.id)} className={cn("flex w-full items-center gap-3 rounded-lg p-3 text-left transition-transform duration-[var(--dur-fast)] ease-[var(--ease-out-custom)] active:scale-[0.97]", selected?.id === entry.id ? "bg-secondary" : "hover:bg-muted/70")}>
            <span className="grid size-7 shrink-0 place-items-center rounded-md bg-muted text-primary">{entry.kind === "agent" ? <Inbox size={14}/> : entry.kind === "workflow" ? <FlaskConical size={14}/> : entry.kind === "proposal" ? <Tag size={14}/> : entry.kind === "extract" ? <FileText size={14}/> : <Workflow size={14}/>}</span>
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{entry.title}</span><span className="mt-1 block truncate text-xs text-muted-foreground">{entry.subtitle}</span></span>
            <span className="shrink-0 text-[11px] text-muted-foreground">{entry.age}</span>
          </button>)}
        </nav>
        <section className="min-w-0 overflow-y-auto rounded-xl border border-border bg-background p-2" aria-live="polite">
          {selected && renderDetail(selected)}
          {selected?.group === "saved" && selected.kind === "triage" && <div className="flex flex-wrap gap-2 px-4 pb-4"><button className={actionClass} onClick={() => void decideSaved(selected, "discard")}>Discard <kbd className="ml-1 text-[10px]">x</kbd></button><button className={actionClass} onClick={() => void decideSaved(selected, "defer")}>Defer <kbd className="ml-1 text-[10px]">d</kbd></button><button className={`${actionClass} bg-primary text-primary-foreground`} onClick={() => void decideSaved(selected, "approve")}>Approve <kbd className="ml-1 text-[10px]">a</kbd></button></div>}
        </section>
      </div>
      <div className="lg:hidden">
        {tab === "saved" ? <CardStack key="saved-phone" items={mobileSaved} renderCard={(item) => item.type === "triage" ? <TriageCard item={item} action={actionFor(item)} onChangeAction={(action) => setOverrides((old) => ({ ...old, [item.id]: action }))} onStartWorkflow={() => void startWorkflow(item.id)} /> : <ProposalCard item={item} mission={missions[item.id] || ""} onMissionChange={(value) => setMissions((old) => ({ ...old, [item.id]: value }))} />} actions={savedActions} swipeLeftId="discard" swipeRightId="approve" guard={(item, id) => item.type === "triage" && id === "approve" && !actionFor(item) ? "Choose a destination first." : item.type === "proposal" && id === "approve" && item.kind === "topic" && !missions[item.id]?.trim() ? "Write what you want to learn first." : null} perform={async (item, id) => { const entry = entries.find((x) => x.id === item.id) as Extract<Entry, {group:"saved"}>; await decideSaved(entry, id); return "Saved"; }} onResolved={(item) => { setTriage((xs) => xs.filter((x) => x.id !== item.id)); setProposals((xs) => xs.filter((x) => x.id !== item.id)); }} undo={async (item) => { if (item.type === "triage") await post("/api/triage/restore", { id: item.id }); }} onRestore={() => void refresh()} emptyLabel="No saved items are waiting." /> : tab === "agents" ? <CardStack items={decisions} renderCard={(item) => <DecisionCard item={item} />} actions={[{ id: "rejected", label: "Reject", icon: X, direction: "left", tone: "danger" }, { id: "deferred", label: "Defer", icon: Clock3, direction: "none", tone: "neutral" }, { id: "approved", label: "Approve", icon: Check, direction: "right", tone: "success" }]} swipeLeftId="rejected" swipeRightId="approved" perform={async (item, id) => { await decideAgent(item, id); return id; }} onResolved={(item) => setDecisions((xs) => xs.filter((x) => x.id !== item.id))} onRestore={() => void refresh()} emptyLabel="No agent approvals are waiting." /> : <div className="space-y-3">{(tab === "all" ? filtered.slice(0, 1) : filtered).map((entry) => <button key={entry.id} onClick={() => setSelectedId(entry.id)} className="w-full rounded-xl border border-border bg-card p-3 text-left"><span className="text-xs text-muted-foreground">{entry.subtitle}</span><span className="mt-1 block font-medium">{entry.title}</span></button>)}{tab === "all" && selected && <div className="flex justify-between"><button className={actionClass} onClick={() => { const i = filtered.findIndex((e) => e.id === selected.id); setSelectedId(filtered[Math.max(0, i - 1)]?.id || ""); }}>Previous</button><button className={actionClass} onClick={() => { const i = filtered.findIndex((e) => e.id === selected.id); setSelectedId(filtered[Math.min(filtered.length - 1, i + 1)]?.id || ""); }}>Next</button></div>}{selected && renderDetail(selected)}</div>}
      </div>
    </>}
  </Page>;
}

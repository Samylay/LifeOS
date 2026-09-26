"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, FlaskConical, Layers, Loader2, RefreshCw, Search, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Page, PageHeader } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { CardStack } from "@/components/decide/card-stack";
import { FlowSelector } from "@/components/workspace/visual-navigation";
import { ResultCard } from "@/components/workflows/result-card";
import { WORKFLOW_KINDS, WORKFLOW_META, STATE_LABEL, type WorkflowRun, type WorkflowKind } from "@/lib/workflows/model";

type Source = { id: string; title: string; sourceUrl: string; hasEvidence: boolean; status: string };
export default function WorkflowsPage() {
  const resolving = useRef(new Set<string>());
  const [runs, setRuns] = useState<WorkflowRun[]>([]); const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  const [view, setView] = useState("ready"); const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState(""); const [kind, setKind] = useState<WorkflowKind>("auto"); const [busy, setBusy] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    try { const response = await fetch("/api/workflows"); if (!response.ok) throw new Error("Could not load workflows"); const data = await response.json(); setRuns(data.runs.filter((r: WorkflowRun) => !resolving.current.has(r.id))); setSources(data.sources); setError(""); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not load workflows"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { setSelected(new URLSearchParams(window.location.search).get("run")); void refresh(); const tick = setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 15000); return () => clearInterval(tick); }, [refresh]);
  async function request(body: Record<string, unknown>) {
    const response = await fetch("/api/workflows", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || "Workflow action failed"); return data.run as WorkflowRun;
  }
  const ready = runs.filter((r) => r.state === "ready");
  const active = runs.filter((r) => ["awaiting-extraction", "queued", "running", "applying", "blocked"].includes(r.state));
  const finished = runs.filter((r) => ["applied", "kept", "dismissed"].includes(r.state));
  const shown = view === "ready" ? ready : view === "active" ? active : finished;
  const run = runs.find((r) => r.id === selected) ?? shown[0];
  const matching = sources.filter((source) => `${source.title} ${source.sourceUrl}`.toLowerCase().includes(query.toLowerCase())).slice(0, 18);
  async function start(source: Source) {
    setBusy(source.id);
    try { const created = await request({ action: "start", itemId: source.id, kind }); await refresh(); setSelected(created.id); setView("active"); toast.success(created.state === "awaiting-extraction" ? "Accepted. Waiting for extraction." : "Workflow opened"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not start"); } finally { setBusy(null); }
  }
  return <Page className="max-w-6xl">
    <PageHeader kicker="Saved ideas in motion" title="Workflows" description="See what was extracted, what was tried, and the change ready for your decision." icon={FlaskConical} actions={<Button variant="outline" onClick={() => void refresh()}><RefreshCw size={15} />Refresh</Button>} />
    <nav aria-label="Saved content journey" className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-background p-4 text-xs text-muted-foreground">{["Save", "Extract", "Explore", "Review", "Apply"].map((label, i) => <span key={label} className="inline-flex items-center gap-2"><span className="grid size-7 place-items-center rounded-full border border-border font-mono">{i+1}</span>{label}{i < 4 && <ArrowRight size={13} aria-hidden="true" />}</span>)}</nav>
    <FlowSelector label="Workflow stage" value={view} onChange={(id) => { setView(id); setSelected(null); }} options={[{ id: "ready", label: "Your decision", count: ready.length, icon: Check }, { id: "active", label: "In progress", count: active.length, icon: FlaskConical }, { id: "finished", label: "Outcomes", count: finished.length, icon: Layers }]} />
    {error && <div role="alert" className="rounded-lg border border-warning/30 p-4 text-sm">{error}. <button className="underline" onClick={() => void refresh()}>Retry</button></div>}
    {loading ? <p role="status" className="p-6 text-sm text-muted-foreground">Loading workflows…</p> : runs.length === 0 ? <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">Choose a saved source below. Its results and next action will appear here.</p> : <div className="grid items-start gap-5 lg:grid-cols-[250px_minmax(0,1fr)]">
      <aside className="space-y-2"><h2 className="mb-3 text-xs font-medium text-muted-foreground">{view === "ready" ? "Ready for your call" : view === "active" ? "Work in progress" : "Recorded outcomes"}</h2>{shown.map((item) => <button key={item.id} aria-pressed={run?.id === item.id} onClick={() => setSelected(item.id)} className={`w-full rounded-xl border p-3 text-left transition-transform duration-[var(--dur-fast)] ease-[var(--ease-out-custom)] active:scale-[0.97] ${run?.id === item.id ? "border-primary/40 bg-secondary" : "border-border bg-card"}`}><p className="text-sm font-medium [overflow-wrap:anywhere]">{item.title}</p><p className="mt-2 text-xs text-muted-foreground">{STATE_LABEL[item.state]}</p></button>)}{shown.length === 0 && <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">{view === "ready" ? "No results need a decision." : view === "active" ? "No workflows are running." : "Applied and kept results will appear here."}</p>}</aside>
      <section className="min-w-0">{run ? run.state === "ready" ? <CardStack key={run.id} items={[run]} renderCard={(item) => <ResultCard run={item} />} actions={[{ id: "dismiss", label: "Leave it", icon: X, direction: "left", tone: "neutral" }, { id: "approve", label: run.report?.effect.label || "Approve", icon: Check, direction: "right", tone: "success" }]} swipeLeftId="dismiss" swipeRightId="approve" perform={async (item, action) => { const next = await request({ id: item.id, action, reportHash: item.reportHash }); resolving.current.delete(item.id); await refresh(); return next.state === "applying" ? "Approved. Applying the prepared change." : next.state === "dismissed" ? "Result dismissed. Source preserved." : "Prepared material saved."; }} onResolved={(item) => { resolving.current.add(item.id); setRuns((current) => current.filter((r) => r.id !== item.id)); setSelected(null); }} onRestore={(item) => { resolving.current.delete(item.id); void refresh(); }} emptyLabel="No result selected." /> : <><ResultCard run={run} />{run.state === "blocked" && run.phase === "evaluate" && <Button variant="outline" disabled={busy === run.id} className="mt-3" onClick={async () => { setBusy(run.id); try { await request({ id: run.id, action: "retry" }); await refresh(); } catch (e) { toast.error(e instanceof Error ? e.message : "Retry failed"); } finally { setBusy(null); } }}><RefreshCw size={15} />Retry evaluation</Button>}</> : <div className="grid min-h-64 place-items-center rounded-2xl border border-dashed border-border p-8 text-center"><div><Sparkles className="mx-auto mb-4 text-muted-foreground" size={28} /><h2 className="text-lg font-medium">An idea can become many things</h2><p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">A design comparison, tool trial, recipe, lesson, or simply a useful reference. Start with a source below.</p></div></div>}</section>
    </div>}
    <details className="rounded-xl border border-border bg-card p-4" open={runs.length === 0 && !loading}>
      <summary className="cursor-pointer font-medium">Start from a saved source</summary>
      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_240px]"><label className="flex items-center gap-2 rounded-lg border border-border bg-background px-3"><Search size={16} /><input aria-label="Find a saved source" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a saved source" className="min-h-11 min-w-0 flex-1 bg-transparent text-sm outline-none" /></label><select aria-label="Workflow to run" value={kind} onChange={(e) => setKind(e.target.value as WorkflowKind)} className="min-h-11 rounded-lg border border-border bg-background px-3 text-sm">{WORKFLOW_KINDS.map((k) => <option key={k} value={k}>{WORKFLOW_META[k].label}</option>)}</select></div>
      <p className="mt-3 text-xs text-muted-foreground">{WORKFLOW_META[kind].output}. Starting prepares a result; installation and integration wait for your approval.</p>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{matching.map((source) => <article key={source.id} className="flex min-w-0 flex-col rounded-xl border border-border bg-background p-4"><h3 className="text-sm font-medium [overflow-wrap:anywhere]">{source.title}</h3><p className="mt-2 text-xs text-muted-foreground">{source.hasEvidence ? "Evidence available" : "Extraction needed"}</p><Button variant="outline" className="mt-4" disabled={busy !== null} onClick={() => void start(source)}>{busy === source.id ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}Develop this</Button></article>)}</div>
      {matching.length === 0 && <p className="mt-4 text-sm text-muted-foreground">No matching sources. <Link href="/decide" className="underline">Open saved items</Link></p>}
      {sources.length > 18 && <p className="mt-3 text-xs text-muted-foreground">Showing up to 18 matches. Search to find any saved source.</p>}
    </details>
  </Page>;
}

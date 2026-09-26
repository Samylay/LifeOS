"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { post } from "@/lib/decide/post";
import { WORKFLOW_KINDS, WORKFLOW_META } from "@/lib/workflows/model";
interface Item { id: string; url: string; title: string; meaning: string; evidenceRef: string | null; assessmentRef: string | null; topics: string[] }
interface Session { answered: number; target: number; items: Item[] }
const button = "min-h-11 rounded-xl border border-border px-4 py-2 text-sm transition-transform duration-[var(--dur-fast)] ease-[var(--ease-out-custom)] active:scale-[0.97] disabled:opacity-50";
export default function CalibratePage() {
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [editing, setEditing] = useState(false);
  const [kind, setKind] = useState("auto");
  const [similar, setSimilar] = useState(false);
  const [busy, setBusy] = useState(false);
  const [more, setMore] = useState(false);
  const refresh = useCallback(async () => {
    try { const response = await fetch("/api/triage/calibration"); if (!response.ok) throw new Error("Could not load saved items"); setSession(await response.json()); setError(""); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not load saved items"); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const item = session?.items[0];
  const save = async (verdict: string) => {
    if (!item) return;
    setBusy(true);
    try {
      await post("/api/triage/calibration", { itemId: item.id, evidenceRef: item.evidenceRef, assessmentRef: item.assessmentRef, verdict, ...(verdict === "corrected" ? { note, workflowKind: kind, scope: similar ? "similar" : "item" } : {}) });
      setNote(""); setEditing(false); setSimilar(false); setKind("auto"); await refresh(); window.dispatchEvent(new Event("lifeos-calibration"));
    } catch (e) { toast.error(e instanceof Error ? e.message : "Answer not saved"); }
    finally { setBusy(false); }
  };
  return <main className="mx-auto max-w-xl space-y-6 px-4 py-8">
    <Link href="/decide" className={`${button} inline-flex items-center`}>Back to Decide</Link>
    <header><p className="text-xs text-muted-foreground">Two-minute review</p><h1 className="mt-2 text-3xl font-semibold">Does my read fit?</h1><p className="mt-2 text-sm text-muted-foreground">Your answers guide future work. Existing filing decisions stay as they are.</p></header>
    {error ? <div role="alert"><p>{error}</p><button className={button} onClick={() => void refresh()}>Retry</button></div> : !session ? <p role="status">Loading one source…</p> : session.answered >= session.target && !more ? <section className="space-y-4 rounded-2xl border border-primary/30 p-5"><h2 className="text-xl font-medium">Three answers saved. Enough for today.</h2><Link href="/workflows" className={`${button} inline-flex`}>See results</Link><button className={button} onClick={() => setMore(true)}>Review more</button></section> : item ? <article className="space-y-5 rounded-2xl border border-border bg-card p-5">
      <p className="text-xs text-muted-foreground">{Math.min(session.answered, session.target)}/{session.target} today</p>
      <h2 className="text-xl font-semibold">{item.title.split(/\s+/).slice(0, 14).join(" ")}</h2>
      <a href={item.url} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center text-sm text-primary active:scale-[0.97]">Open original</a>
      <div className="rounded-xl bg-secondary p-4"><p className="text-xs text-muted-foreground">My read</p><p className="mt-2 text-base leading-relaxed">{item.meaning}</p></div>
      {editing ? <div className="space-y-3"><label htmlFor="intent" className="text-sm font-medium">What did you save it for?</label><textarea id="intent" value={note} onChange={e => setNote(e.target.value)} maxLength={2000} rows={3} placeholder="One sentence. Multiple uses are welcome." className="w-full rounded-xl border border-border bg-background p-3" /><label className="block text-sm">Start with <select value={kind} onChange={e => setKind(e.target.value)} className="ml-2 min-h-10 rounded-lg border border-border bg-background px-2">{WORKFLOW_KINDS.map(k => <option key={k} value={k}>{WORKFLOW_META[k].label}</option>)}</select></label>{item.topics.length > 0 && <label className="block text-sm"><input type="checkbox" checked={similar} onChange={e => setSimilar(e.target.checked)} className="mr-2" />Remember for these topics: {item.topics.slice(0, 4).join(", ")}</label>}<button disabled={busy || !note.trim()} className={`${button} bg-primary text-primary-foreground`} onClick={() => void save("corrected")}>Save & next</button></div> : <div className="flex flex-wrap gap-2"><button disabled={busy} className={`${button} bg-primary text-primary-foreground`} onClick={() => void save("fits")}>Fits</button><button disabled={busy} className={button} onClick={() => setEditing(true)}>Different use</button><button disabled={busy} className={button} onClick={() => void save("not-for-me")}>Not relevant to me</button></div>}
    </article> : <p>Every available source has an answer. New saves will appear here.</p>}
  </main>;
}

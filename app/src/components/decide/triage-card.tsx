"use client";
import { useState } from "react";
import { ArrowUpRight, MessageSquare, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { actionKey, actionLabel, selectableDecideActions, type Action } from "@/lib/decide/homelab-actions";
import { WORKFLOW_KINDS, WORKFLOW_META } from "@/lib/workflows/model";
import type { TriageCategory } from "@/lib/triage";
import { post } from "@/lib/decide/post";

export interface TriageQueueItem {
  id: string;
  url: string;
  source: string;
  savedAt?: { __date?: string } | string;
  evidenceRef?: string;
  assessmentRef?: string;
  topicTags?: string[];
  vaultTags?: string[];
  evidenceSummary?: {
    bundleId?: string;
    sourceCount?: number;
    segmentCount?: number;
    coverage?: string[];
    issueCount?: number;
    quality?: string;
  };
  calibration?: { note?: string; interpretation?: string; verdict?: string; workflowKind?: string; scope?: string };
  proposal?: {
    title?: string;
    tags?: string[];
    category?: TriageCategory;
    summary?: string;
    why_relevant?: string;
    assessment?: { verdict?: string; detail?: string; effort?: string; payoff?: string; apply?: string };
    destination?: string;
    confidence?: string;
    extraction?: { quality?: string; detail?: string };
    rationale?: string;
  };
}

const short = (text: string | undefined, count = 22) => { const words = (text || "").trim().split(/\s+/); return words.length > count ? words.slice(0, count).join(" ") + "…" : words.join(" "); };
const press = "min-h-10 rounded-lg px-3 text-sm transition-transform duration-[var(--dur-fast)] ease-[var(--ease-out-custom)] active:scale-[0.97]";
export function TriageCard({ item, action, onChangeAction, onFeedback }: { item: TriageQueueItem; action: Action | null; onChangeAction?: (action: Action) => void; onFeedback?: () => void }) {
  const p = item.proposal ?? {};
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(item.calibration?.note || "");
  const [kind, setKind] = useState(item.calibration?.workflowKind || "auto");
  const [similar, setSimilar] = useState(false);
  const [busy, setBusy] = useState(false);
  const meaning = short(item.calibration?.note || p.assessment?.apply || p.why_relevant || p.summary || "Explore this source and propose a useful next step.");
  const tags = [...(item.topicTags || []), ...(item.vaultTags || []), ...(p.tags || [])];
  const save = async () => {
    setBusy(true);
    try {
      await post("/api/triage/calibration", { itemId: item.id, evidenceRef: item.evidenceRef ?? null, assessmentRef: item.assessmentRef ?? null, verdict: "corrected", note, workflowKind: kind, scope: similar ? "similar" : "item" });
      setEditing(false); window.dispatchEvent(new Event("lifeos-calibration")); onFeedback?.(); toast.success("Remembered. Your intended use guides the work.");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not save your answer"); }
    finally { setBusy(false); }
  };
  return <div className="space-y-5 p-5 sm:p-6">
    <div className="flex items-center justify-between text-xs text-muted-foreground"><span>{item.source}</span><a href={item.url} target="_blank" rel="noreferrer" className={press}>Source <ArrowUpRight size={12} className="inline" /></a></div>
    <h2 className="text-2xl font-semibold leading-snug [overflow-wrap:anywhere]">{short(p.title || p.summary || item.url, 12)}</h2>
    <p className="text-base leading-relaxed text-muted-foreground">{short(p.summary, 25)}</p>
    <section className="space-y-2 rounded-xl border border-primary/25 bg-primary/5 p-4">
      <h3 className="text-xs font-medium text-primary">{item.calibration?.note ? "Your intended use" : "My read"}</h3>
      <p className="text-base leading-relaxed">{meaning}</p>
      <p className="text-sm text-muted-foreground">Does that fit why you saved it?</p>
      <button type="button" onClick={() => setEditing(!editing)} className={`${press} -ml-3 text-primary`}><MessageSquare size={14} className="mr-2 inline" />Different use</button>
    </section>
    {editing && <section className="space-y-3" aria-label="Correct this interpretation">
      <label className="block text-sm font-medium" htmlFor={`intent-${item.id}`}>What did you want from it?</label>
      <textarea id={`intent-${item.id}`} value={note} onChange={e => setNote(e.target.value)} maxLength={2000} rows={3} placeholder="One sentence is enough. Multiple uses are welcome." className="w-full rounded-xl border border-border bg-background p-3 text-base" />
      <label className="block text-sm">Start with <select value={kind} onChange={e => setKind(e.target.value)} className="ml-2 min-h-10 max-w-full rounded-lg border border-border bg-background px-2">{WORKFLOW_KINDS.map(k => <option key={k} value={k}>{WORKFLOW_META[k].label}</option>)}</select></label>
      {tags.length > 0 && <label className="flex items-center gap-2 text-sm text-muted-foreground"><input type="checkbox" checked={similar} onChange={e => setSimilar(e.target.checked)} />Remember for these topics</label>}
      {similar && <p className="text-xs text-muted-foreground">{tags.slice(0, 6).join(" · ")}</p>}
      <button type="button" disabled={busy || !note.trim()} onClick={() => void save()} className={`${press} bg-primary text-primary-foreground disabled:opacity-50`}>{busy && <LoaderCircle size={14} className="mr-2 inline animate-spin" />}Remember this</button>
    </section>}
    <p className="text-sm font-medium">Swipe right: {action?.id === "homelab-develop" ? "yes, handle it" : action ? actionLabel(action) : "choose a use"}.</p>
    {p.extraction?.quality && p.extraction.quality !== "usable" && <p className="text-xs text-warning">Some source details are missing. Results will flag the gaps.</p>}
    <details className="text-sm"><summary className={`${press} -ml-3 cursor-pointer text-muted-foreground`}>Details & other actions</summary><div className="mt-2 space-y-3">
      <p className="whitespace-pre-wrap leading-relaxed text-muted-foreground">{p.summary}</p>
      {item.evidenceRef && <a href={`/decide/sources/${encodeURIComponent(item.id)}`} className={`${press} inline-flex items-center text-primary`}>Read extracted evidence</a>}
      <div className="flex flex-wrap gap-2">{onChangeAction && selectableDecideActions(item, action).map(alt => <button type="button" key={actionKey(alt)} aria-pressed={!!action && actionKey(action) === actionKey(alt)} onClick={() => onChangeAction(alt)} className={`${press} border border-border`}>{actionLabel(alt)}</button>)}</div>
    </div></details>
  </div>;
}

"use client";
/* Artifact media are uploaded to this app, never arbitrary remote embeds. */
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { ArrowUpRight, FileText, Check, CircleAlert } from "lucide-react";
import { EvidenceDetails } from "@/components/decide/evidence-details";
import { STATE_LABEL, WORKFLOW_META, type WorkflowRun } from "@/lib/workflows/model";

const short = (text: string, words = 25) => { const parts = text.split(/\s+/); return parts.length > words ? parts.slice(0, words).join(" ") + "…" : text; };

export function ResultCard({ run }: { run: WorkflowRun }) {
  const report = run.report;
  const artifacts = run.artifacts.filter((a) => report?.artifactIds.includes(a.id));
  return <article className="overflow-hidden rounded-2xl border border-border bg-card">
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><span className="text-xs text-muted-foreground">{WORKFLOW_META[report?.kind || run.kind].label} · {STATE_LABEL[run.state]}</span>{run.sourceUrl && <a href={run.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center gap-1 text-xs text-muted-foreground active:scale-[0.97]">Original source <ArrowUpRight size={13} /></a>}</div>
      <h2 className="text-xl font-semibold [overflow-wrap:anywhere]">{short(run.title, 12)}</h2>
      {report && <>
        <div className="flex items-start gap-2 text-sm"><span className={report.outcome === "pass" ? "text-success" : "text-muted-foreground"}>{report.outcome === "pass" ? <Check size={18} /> : <CircleAlert size={18} />}</span><div><p className="font-medium capitalize">{report.outcome === "reference" ? "Reference prepared" : report.outcome}</p><p className="mt-1 whitespace-pre-wrap text-muted-foreground">{short(report.summary)}</p></div></div>
        {artifacts.length > 0 && <div className="grid gap-3 sm:grid-cols-2">{artifacts.map((artifact) => <figure key={artifact.id} className={artifact.kind === "video" ? "sm:col-span-2" : ""}>
          {artifact.kind === "image" ? <a href={artifact.href} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border border-border bg-background"><img src={artifact.href} alt={artifact.name} className="max-h-[420px] w-full object-contain" loading="lazy" /></a> : artifact.kind === "video" ? <video src={artifact.href} controls preload="metadata" aria-label={artifact.name} className="max-h-[480px] w-full rounded-lg border border-border bg-background" /> : <a href={artifact.href} target="_blank" rel="noreferrer" className="flex min-h-14 items-center gap-2 rounded-lg border border-border bg-background p-3 text-sm"><FileText size={18} />{artifact.name}</a>}
          <figcaption className="mt-2 break-words text-xs text-muted-foreground">{artifact.name}</figcaption>
        </figure>)}</div>}
        {report.metrics.length > 0 && <div className="overflow-x-auto"><table className="w-full text-left text-sm"><caption className="mb-2 text-left text-xs text-muted-foreground">Reported measurements</caption><thead><tr className="border-b border-border text-xs text-muted-foreground"><th className="py-2 pr-3">Measure</th><th className="pr-3">Control</th><th>With reference</th></tr></thead><tbody>{report.metrics.map((m, i) => <tr key={i} className="border-b border-border"><td className="py-2 pr-3">{m.label}</td><td className="pr-3 font-mono text-xs">{m.control === undefined ? "Not measured" : `${m.control} ${m.unit}`}</td><td className="font-mono text-xs">{m.treatment} {m.unit}</td></tr>)}</tbody></table></div>}
        <ul className="space-y-2 text-sm">{report.findings.slice(0, 3).map((finding, i) => <li key={i} className="flex gap-2"><span className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground" /><span className="whitespace-pre-wrap">{short(finding, 18)}</span></li>)}</ul>
        {report.limitations.length > 0 && <section className="rounded-lg border border-warning/30 p-3"><h3 className="text-xs font-medium text-warning">Limits of this result</h3>{report.limitations.slice(0, 2).map((limitation, i) => <p key={i} className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{short(limitation, 25)}</p>)}</section>}
        {report.prepared && <details className="rounded-lg border border-border bg-background p-4"><summary className="cursor-pointer text-sm font-medium">Read the full prepared result</summary><h3 className="mt-3 text-sm font-medium">{report.prepared.title}</h3><p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">{report.prepared.body}</p>{report.prepared.recipe && <details className="mt-3"><summary className="cursor-pointer text-xs">Exact ingredients and method to save</summary><ul className="mt-3 space-y-1 text-sm">{report.prepared.recipe.ingredients.map((ingredient, i) => <li key={i}>{ingredient.quantity} {ingredient.name}</li>)}</ul><ol className="step-method mt-3">{report.prepared.recipe.steps.map((step, i) => <li key={i} className="text-sm">{step}</li>)}</ol></details>}</details>}
        <section className="rounded-xl border border-primary/30 bg-secondary p-4"><p className="text-xs text-muted-foreground">{run.state === "ready" ? "Approve to" : "Prepared action"}</p><h3 className="mt-1 font-medium">{report.effect.label}</h3><p className="mt-2 whitespace-pre-wrap text-sm">{report.effect.consequence}</p>{report.effect.repository && <p className="mt-3 break-all font-mono text-xs text-muted-foreground">{report.effect.repository}<br />Commit {report.effect.commit}<br />{report.effect.sourcePath} → {report.effect.target}</p>}</section>
      </>}
      {run.reason && <p role="alert" className="rounded-lg border border-warning/30 p-3 text-sm whitespace-pre-wrap">{run.reason}</p>}
      {run.state === "awaiting-extraction" && <p className="text-sm text-muted-foreground">Accepted. The extractor needs to publish source evidence before work can begin.</p>}
      {run.state === "queued" && <p className="text-sm text-muted-foreground">The host agent has the request. Results will appear here when it reports back.</p>}
      {run.state === "applying" && <p role="status" className="text-sm text-muted-foreground">Your approved change is being applied. Completion will appear after the agent reports what changed.</p>}
      {run.appliedSummary && <section><h3 className="text-sm font-medium">What changed</h3><p className="mt-2 text-sm">{run.appliedSummary}</p>{run.outcomeEvidence?.map((e, i) => <p key={i} className="mt-1 text-xs text-muted-foreground">{e}</p>)}</section>}
      {run.destination && <Link href={run.destination} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm active:scale-[0.97]">Open destination <ArrowUpRight size={14} /></Link>}
      <details><summary className="cursor-pointer text-sm text-muted-foreground">Full findings & evidence</summary><p className="mt-3 text-sm">{report?.summary}</p><ul className="my-3 space-y-2 text-sm">{report?.findings.map((text, i) => <li key={i}>{text}</li>)}</ul><ul className="my-3 space-y-2 text-sm text-muted-foreground">{report?.limitations.map((text, i) => <li key={i}>{text}</li>)}</ul><EvidenceDetails itemId={run.itemId} evidenceRef={run.evidenceRef || undefined} /></details>
      <details><summary className="cursor-pointer text-xs text-muted-foreground">Workflow history</summary><ol className="step-method mt-3">{run.history.map((event, i) => <li key={i}><p className="text-xs font-medium">{STATE_LABEL[event.state]}</p><p className="mt-1 text-xs text-muted-foreground">{event.detail}</p><time className="text-[10px] text-muted-foreground">{new Date(event.at).toLocaleString()}</time></li>)}</ol></details>
    </div>
  </article>;
}

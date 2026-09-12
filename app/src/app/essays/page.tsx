"use client";

import { useMemo, useState } from "react";
import { Feather, FileSearch, ListTree, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EssayWritingGuide } from "@/components/essay-writing-guide";
import { Input } from "@/components/ui/input";
import { Page, PageHeader } from "@/components/ui/page";
import { Textarea } from "@/components/ui/textarea";
import { DIMENSIONS, ESSAY_GENRES, type EssayGenre, type EssayReview, type ReviewStatus, wordCount } from "@/lib/essay-review/model";

const genreLabels: Record<EssayGenre, string> = {
  argumentative: "Argumentative",
  analytical: "Analytical",
  explanatory: "Explanatory",
  personal: "Personal / narrative",
  "literary-analysis": "Literary analysis",
  research: "Research essay",
  general: "General nonfiction",
};
const statusLabels: Record<ReviewStatus, string> = {
  strong: "Strong",
  developing: "Developing",
  "needs-work": "Needs work",
  "not-applicable": "Not applicable",
  "cannot-assess": "Cannot assess",
};
const statusStyles: Record<ReviewStatus, string> = {
  strong: "bg-success/12 text-success border-success/25",
  developing: "bg-warning/12 text-warning border-warning/25",
  "needs-work": "bg-destructive/12 text-destructive border-destructive/25",
  "not-applicable": "bg-muted text-muted-foreground border-border",
  "cannot-assess": "bg-muted text-muted-foreground border-border",
};
const field = "mt-2 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none transition-[border-color,box-shadow] duration-150 focus:border-ring focus:ring-2 focus:ring-ring/20";

export default function EssaysPage() {
  const [form, setForm] = useState({ title: "", prompt: "", genre: "general" as EssayGenre, audience: "", constraints: "", essay: "" });
  const [review, setReview] = useState<EssayReview | null>(null);
  const [busy, setBusy] = useState(false);
  const words = useMemo(() => wordCount(form.essay), [form.essay]);
  const paragraphs = useMemo(() => form.essay.trim() ? form.essay.trim().split(/\n\s*\n/u).length : 0, [form.essay]);
  const set = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (words < 50 || busy) return;
    setBusy(true);
    try {
      const response = await fetch("/api/essays/review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "The essay could not be reviewed.");
      setReview(data.review);
      toast.success("Review ready");
      requestAnimationFrame(() => document.getElementById("essay-review")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The essay could not be reviewed.");
    } finally {
      setBusy(false);
    }
  }

  return <Page className="max-w-6xl">
    <PageHeader kicker="Writing studio" title="Essay workshop" description="Find the argument that is already there, then strengthen the places where the reader has to guess." icon={Feather} actions={<EssayWritingGuide />} />

    <form onSubmit={submit} className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_19rem]">
      <section className="enter rounded-2xl border border-border bg-card shadow-card">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-6">
          <div><p className="text-sm font-medium">Draft</p><p className="mt-0.5 text-xs text-muted-foreground">Paste a finished draft for the first review.</p></div>
          <div className="font-mono text-[11px] text-muted-foreground">{words} words · {paragraphs} {paragraphs === 1 ? "paragraph" : "paragraphs"}</div>
        </div>
        <Textarea aria-label="Essay draft" value={form.essay} onChange={(event) => set("essay", event.target.value)} placeholder="Start with the essay itself. The reviewer will quote your exact words when it finds something worth revising." className="min-h-[34rem] resize-y rounded-none border-0 bg-transparent px-4 py-5 text-[1.02rem] leading-8 shadow-none focus-visible:ring-0 sm:px-8" disabled={busy} />
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 sm:px-6">
          <p className="text-xs text-muted-foreground">Nothing is saved. Feedback diagnoses; it does not rewrite.</p>
          <Button type="submit" disabled={busy || words < 50} className="active:scale-[0.97]">
            {busy ? <><RefreshCw className="animate-spin" /> Reading the argument…</> : <><Sparkles /> Review essay</>}
          </Button>
        </div>
      </section>

      <aside className="enter rounded-2xl border border-border bg-card p-5 shadow-card [animation-delay:30ms] lg:sticky lg:top-20">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Assignment contract</p>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Context prevents generic advice. Leave unknown fields blank and the review will mark its limits.</p>
        <div className="mt-5 space-y-4">
          <label className="block text-sm">Working title<Input className="mt-2" maxLength={160} value={form.title} onChange={(event) => set("title", event.target.value)} disabled={busy} /></label>
          <label className="block text-sm">Essay type<select className={field} value={form.genre} onChange={(event) => set("genre", event.target.value)} disabled={busy}>{ESSAY_GENRES.map((genre) => <option key={genre} value={genre}>{genreLabels[genre]}</option>)}</select></label>
          <label className="block text-sm">Question or prompt<Textarea className="mt-2 min-h-24" maxLength={4000} value={form.prompt} onChange={(event) => set("prompt", event.target.value)} placeholder="What must this essay answer or accomplish?" disabled={busy} /></label>
          <label className="block text-sm">Audience<Input className="mt-2" maxLength={500} value={form.audience} onChange={(event) => set("audience", event.target.value)} placeholder="Who will read it?" disabled={busy} /></label>
          <label className="block text-sm">Constraints<Textarea className="mt-2 min-h-20" maxLength={2000} value={form.constraints} onChange={(event) => set("constraints", event.target.value)} placeholder="Length, sources, citation style, rubric…" disabled={busy} /></label>
        </div>
      </aside>
    </form>

    {review && <section id="essay-review" className="scroll-mt-20 space-y-5">
      <div className="enter rounded-2xl border border-border bg-card p-5 shadow-card sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl"><p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Editorial diagnosis</p><h2 className="mt-2">{review.verdict === "on-track" ? "The argument is holding together" : review.verdict === "rethink" ? "The argument needs a new center" : review.verdict === "cannot-assess" ? "The review needs more context" : "The next revision is clear"}</h2><p className="mt-3 leading-relaxed text-muted-foreground">{review.summary}</p></div>
          <Button type="button" variant="outline" onClick={() => setReview(null)} className="active:scale-[0.97]"><RefreshCw /> Edit draft</Button>
        </div>
        {review.priorities.length > 0 && <div className="mt-7 grid gap-3 md:grid-cols-3">{review.priorities.map((priority, index) => <article key={`${priority.dimension}-${index}`} className="rounded-xl border border-border bg-background/60 p-4 transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-pop">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Revision {index + 1}</p><h3 className="mt-2 text-sm font-semibold">{priority.title}</h3><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{priority.reason}</p><p className="mt-3 border-l-2 border-primary/40 pl-3 text-sm leading-relaxed">{priority.action}</p>
        </article>)}</div>}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-3">{review.dimensions.map((dimension, index) => { const meta = DIMENSIONS.find((item) => item.id === dimension.id)!; return <details key={dimension.id} open={dimension.findings.length > 0 && index < 4} className="group enter rounded-xl border border-border bg-card shadow-card [animation-delay:var(--delay)]" style={{ "--delay": `${Math.min(index * 25, 200)}ms` } as React.CSSProperties}>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-4 active:scale-[0.99] transition-transform duration-150 sm:px-5"><div className="flex min-w-0 items-center gap-3"><span aria-hidden="true" className={`size-2.5 shrink-0 rounded-full border ${statusStyles[dimension.status]}`} /><div className="min-w-0"><h3 className="truncate text-sm font-semibold">{meta.label}</h3><p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{dimension.summary}</p></div></div><Badge variant="outline" className={statusStyles[dimension.status]}>{statusLabels[dimension.status]}</Badge></summary>
          <div className="border-t border-border px-4 py-4 sm:px-5"><p className="text-sm leading-relaxed text-muted-foreground">{dimension.summary}</p>{dimension.findings.length === 0 ? <p className="mt-3 text-xs text-muted-foreground">No passage-level finding was supported here.</p> : <div className="mt-4 space-y-4">{dimension.findings.map((finding, findingIndex) => <article key={findingIndex} className="grid gap-3 border-l-2 border-border pl-4"><blockquote className="text-sm italic text-foreground">“{finding.quote}”</blockquote><div><p className="text-sm font-medium">{finding.issue}</p><p className="mt-1 text-sm leading-relaxed text-muted-foreground">{finding.whyItMatters}</p></div><p className="text-sm leading-relaxed"><span className="text-muted-foreground">Revise: </span>{finding.revision}</p><p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{finding.confidence} confidence</p></article>)}</div>}</div>
        </details>; })}</div>

        <aside className="h-fit rounded-2xl border border-border bg-card p-5 shadow-card lg:sticky lg:top-20"><div className="flex items-center gap-2"><ListTree className="size-4 text-muted-foreground"/><h2 className="text-base">Reverse outline</h2></div><p className="mt-2 text-sm leading-relaxed text-muted-foreground">What each paragraph currently does, independent of what you intended.</p><ol className="mt-4 space-y-4">{review.outline.map((item) => <li key={item.paragraph} className="grid grid-cols-[1.5rem_1fr] gap-2"><span className="font-mono text-xs text-muted-foreground">{String(item.paragraph).padStart(2, "0")}</span><div><p className="text-sm font-medium">{item.job}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.contribution}</p></div></li>)}</ol>{review.outline.length === 0 && <p className="mt-4 text-sm text-muted-foreground">The reviewer could not recover a reliable paragraph structure.</p>}</aside>
      </div>
    </section>}

    {!review && <section className="enter grid gap-3 border-t border-border pt-5 sm:grid-cols-3 [animation-delay:60ms]">{[
      [FileSearch, "Evidence, not vibes", "Every criticism must point to your exact words."],
      [ListTree, "Structure made visible", "A reverse outline shows what each paragraph is doing."],
      [Feather, "Your voice stays yours", "The reviewer asks for revisions instead of replacing your prose."],
    ].map(([Icon, title, copy]) => <div key={String(title)} className="rounded-xl bg-muted/35 p-4"><Icon className="size-4 text-muted-foreground"/><p className="mt-3 text-sm font-medium">{String(title)}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{String(copy)}</p></div>)}</section>}
  </Page>;
}

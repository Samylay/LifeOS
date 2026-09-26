import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { getDoc } from "@/lib/server-db";
import { record, sourceClaims } from "@/lib/extraction-review";
import { EvidenceDetails } from "@/components/decide/evidence-details";

export const dynamic = "force-dynamic";
const press = "inline-flex min-h-10 items-center gap-2 rounded-md text-sm text-primary underline-offset-4 hover:underline transition-transform duration-[var(--dur-fast)] ease-[var(--ease-out-custom)] active:scale-[0.97]";
const label = (value: unknown) => String(value ?? "").replace(/[_-]/g, " ");
const time = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;

export default async function SourceReview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = getDoc("users/local/triageQueue", id);
  if (!item) notFound();
  const evidenceRef = typeof item.evidenceRef === "string" ? item.evidenceRef : undefined;
  const assessmentRef = typeof item.assessmentRef === "string" ? item.assessmentRef : undefined;
  const bundle: Record<string, unknown> = evidenceRef ? getDoc("users/local/triageEvidence", evidenceRef) ?? {} : {};
  const assessment: Record<string, unknown> = assessmentRef ? getDoc("users/local/triageAssessments", assessmentRef) ?? {} : {};
  const current = assessment.bundleId === bundle.bundleId && assessment.itemId === id;
  const proposal = current ? record(assessment.proposal) : {};
  const claims = sourceClaims(bundle, current ? assessment : {});
  const coverage = Array.isArray(bundle.coverage) ? bundle.coverage.map(record) : [];
  const sources = Array.isArray(bundle.sources) ? bundle.sources.map(record) : [];
  const sourceUrl = typeof item.url === "string" && /^https?:\/\//i.test(item.url) ? item.url : null;

  return (
    <main className="mx-auto w-full max-w-6xl space-y-8 px-4 py-6 sm:px-8 sm:py-10">
      <Link href="/decide" className={press}><ArrowLeft size={16} aria-hidden />Back to saved sources</Link>
      <header className="max-w-3xl space-y-3">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Source review</p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{String(proposal.title ?? "Saved source")}</h1>
        <p className="text-base leading-relaxed text-muted-foreground">{String(proposal.summary ?? "The source is saved. Its extraction is not ready yet.")}</p>
        {sourceUrl && <a href={sourceUrl} target="_blank" rel="noreferrer" className={press}>Open original<ArrowUpRight size={16} aria-hidden /></a>}
      </header>
      <div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="min-w-0 space-y-5" aria-label="Source takeaways">
          <h2 className="text-lg font-semibold">What the source says</h2>
          <p className="text-sm text-muted-foreground">Generated paraphrases, linked to the captured evidence. Source claims have not been independently verified.</p>
          {claims.length ? <ol className="space-y-6 border-l border-border pl-5">
            {claims.map((claim, index) => <li key={index} className="relative space-y-2">
              <span className="absolute -left-[1.55rem] top-2 h-2 w-2 rounded-full bg-primary" aria-hidden />
              <p className="text-base leading-relaxed [overflow-wrap:anywhere]">{claim.text}</p>
              {claim.url && <a href={claim.url} target="_blank" rel="noreferrer" className={press}>{claim.startMs === null ? "See source" : `${time(claim.startMs)} · Open media`}<ArrowUpRight size={13} aria-hidden /></a>}
            </li>)}
          </ol> : <p className="rounded-xl border border-border p-5 text-sm text-muted-foreground">No current grounded takeaways are available. You can inspect the original source and any captured evidence below.</p>}
        </section>
        <aside className="min-w-0 self-start rounded-2xl border border-border bg-card p-5" aria-label="Extraction coverage">
          <h2 className="font-semibold">What was captured</h2>
          <p className="mt-2 text-sm text-muted-foreground">{coverage.length ? "Partial channels can contain gaps. Open the original when those details matter." : "No extraction coverage has been published."}</p>
          <ul className="mt-4 divide-y divide-border">
            {coverage.map((channel, index) => <li key={index} className="py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span className="capitalize">{label(channel.aspect)}</span>
                <span className={channel.status === "complete" ? "text-success" : channel.status === "unavailable" ? "text-warning" : "text-muted-foreground"}>{label(channel.status)}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{label(sources.find((source) => source.id === channel.sourceId)?.kind)}{typeof channel.processedCount === "number" ? ` · ${channel.processedCount} captured` : ""}</p>
              {(channel.detail || channel.reasonCode) ? <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{label(channel.detail || channel.reasonCode)}</p> : null}
            </li>)}
          </ul>
        </aside>
      </div>
      <EvidenceDetails key={evidenceRef ?? id} evidenceRef={evidenceRef} assessmentRef={current ? assessmentRef : undefined} itemId={id} />
    </main>
  );
}

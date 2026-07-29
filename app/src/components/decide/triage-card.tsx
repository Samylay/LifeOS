"use client";

// One saved-content card: enough to rule without opening the post — what it
// is, the category-specific assessment (validity for business ideas,
// exploration for AI/SWE content), and where the study step proposes filing.
import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { categoryMeta } from "@/components/decide/category-colors";
import type { TriageCategory } from "@/lib/triage";

export interface TriageQueueItem {
  id: string;
  url: string;
  source: string;
  savedAt?: { __date?: string } | string;
  proposal?: {
    title?: string;
    category?: TriageCategory;
    summary?: string;
    why_relevant?: string;
    assessment?: { verdict?: string; detail?: string; effort?: string; payoff?: string; apply?: string };
    destination?: string;
    confidence?: string;
    rationale?: string;
  };
}

const VERDICT_COLORS: Record<string, string> = {
  pursue: "var(--success)", adopt: "var(--success)",
  maybe: "var(--warning)", try: "var(--warning)",
  skim: "var(--muted-foreground)",
  pass: "var(--destructive)", skip: "var(--destructive)",
};

// Confidence dot in the footer — a glanceable signal instead of prose.
const CONFIDENCE_COLORS: Record<string, string> = {
  high: "var(--success)",
  medium: "var(--warning)",
  low: "var(--muted-foreground)",
};

function parseDate(v: TriageQueueItem["savedAt"]): string {
  const iso = typeof v === "string" ? v : v?.__date;
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function Field({ label, value }: { label: string; value?: string }) {
  if (!value || value === "none") return null;
  return (
    <div className="text-sm leading-relaxed">
      <span className="font-medium text-muted-foreground">{label} </span>
      <span className="text-foreground">{value}</span>
    </div>
  );
}

export function TriageCard({ item }: { item: TriageQueueItem }) {
  const p = item.proposal ?? {};
  const a = p.assessment;
  const cat = categoryMeta(p.category);
  const CatIcon = cat.icon;
  const isBiz = p.category === "business-idea";
  const confidenceColor =
    CONFIDENCE_COLORS[(p.confidence ?? "").toLowerCase()] ?? "var(--muted-foreground)";
  const verdictColor = VERDICT_COLORS[(a?.verdict ?? "").split(/\W/)[0].toLowerCase()] ?? "var(--muted-foreground)";

  return (
    <div className="space-y-3 p-5">
      <div className="flex items-center gap-2 text-xs">
        <Badge variant="secondary" className="rounded font-medium uppercase tracking-wide">
          {item.source}
        </Badge>
        <span className="inline-flex items-center gap-1 font-medium" style={{ color: cat.color }}>
          <CatIcon size={12} aria-hidden /> {cat.label}
        </span>
        <span className="ml-auto text-muted-foreground">{parseDate(item.savedAt)}</span>
      </div>

      <h2 className="text-lg font-semibold leading-snug text-foreground">
        {p.title ?? p.summary ?? item.url}
      </h2>
      {p.title && p.summary && (
        <p className="text-sm leading-relaxed text-muted-foreground">{p.summary}</p>
      )}

      {a && (
        <div className="space-y-2 rounded-lg bg-muted p-3">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: verdictColor }}>
              {a.verdict}
            </span>
            <span className="text-xs text-muted-foreground">
              {isBiz ? "validity" : "worth it?"}
            </span>
          </div>
          <Field label={isBiz ? "The call:" : "What it is:"} value={a.detail} />
          <div className="grid grid-cols-2 gap-x-3">
            <Field label="Effort:" value={a.effort} />
            <Field label="Payoff:" value={a.payoff} />
          </div>
          <Field label="First step:" value={a.apply} />
        </div>
      )}

      <Field label="Why you:" value={p.why_relevant} />

      {p.destination && (
        <div className="flex items-center gap-1.5 pt-1 text-xs text-muted-foreground">
          <span>→ <span className="font-medium">{p.destination}</span></span>
          <span
            aria-label={p.confidence ? `confidence: ${p.confidence}` : undefined}
            title={p.confidence ? `confidence: ${p.confidence}` : undefined}
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: confidenceColor }}
          />
        </div>
      )}
      <a href={item.url} target="_blank" rel="noreferrer"
        className="inline-flex items-center gap-1 text-xs font-medium text-primary transition-transform duration-150 active:scale-[0.97]">
        <ExternalLink size={12} /> open original
      </a>
    </div>
  );
}

"use client";

// One saved-content card: enough to rule without opening the post — what it
// is, the category-specific assessment (validity for business ideas,
// exploration for AI/SWE content), and where the study step proposes filing.
import { ExternalLink } from "lucide-react";
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

const CATEGORY_META: Record<string, { label: string; color: string }> = {
  "business-idea": { label: "💰 Business idea", color: "#F59E0B" },
  "ai-tip": { label: "✨ AI tip", color: "#8B5CF6" },
  "ai-project": { label: "🛠 AI project", color: "#8B5CF6" },
  swe: { label: "⌨️ SWE", color: "var(--accent)" },
  other: { label: "Link", color: "var(--text-tertiary)" },
};

const VERDICT_COLORS: Record<string, string> = {
  pursue: "#22C55E", adopt: "#22C55E",
  maybe: "#F59E0B", try: "#F59E0B",
  skim: "var(--text-tertiary)",
  pass: "#EF4444", skip: "#EF4444",
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
      <span className="font-medium" style={{ color: "var(--text-tertiary)" }}>{label} </span>
      <span style={{ color: "var(--text-primary)" }}>{value}</span>
    </div>
  );
}

export function TriageCard({ item }: { item: TriageQueueItem }) {
  const p = item.proposal ?? {};
  const a = p.assessment;
  const cat = CATEGORY_META[p.category ?? "other"] ?? CATEGORY_META.other;
  const isBiz = p.category === "business-idea";
  const verdictColor = VERDICT_COLORS[(a?.verdict ?? "").split(/\W/)[0].toLowerCase()] ?? "var(--text-secondary)";

  return (
    <div className="p-5 space-y-3">
      <div className="flex items-center gap-2 text-xs">
        <span className="rounded px-1.5 py-0.5 font-medium uppercase tracking-wide"
          style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}>
          {item.source}
        </span>
        <span className="font-medium" style={{ color: cat.color }}>{cat.label}</span>
        <span className="ml-auto" style={{ color: "var(--text-tertiary)" }}>{parseDate(item.savedAt)}</span>
      </div>

      <h2 className="text-lg font-semibold leading-snug" style={{ color: "var(--text-primary)" }}>
        {p.title ?? p.summary ?? item.url}
      </h2>
      {p.title && p.summary && (
        <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{p.summary}</p>
      )}

      {a && (
        <div className="rounded-lg p-3 space-y-2" style={{ background: "var(--bg-tertiary)" }}>
          <div className="flex items-center gap-2 text-sm">
            <span className="font-semibold uppercase text-xs tracking-wide" style={{ color: verdictColor }}>
              {a.verdict}
            </span>
            <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
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

      <div className="flex items-center gap-2 text-xs pt-1" style={{ color: "var(--text-tertiary)" }}>
        <span>
          → <span className="font-medium" style={{ color: "var(--text-secondary)" }}>{p.destination}</span>
          {" "}({p.confidence}) — {p.rationale}
        </span>
      </div>
      <a href={item.url} target="_blank" rel="noreferrer"
        className="inline-flex items-center gap-1 text-xs font-medium transition-transform duration-150 active:scale-[0.97]"
        style={{ color: "var(--accent)" }}>
        <ExternalLink size={12} /> open original
      </a>
    </div>
  );
}

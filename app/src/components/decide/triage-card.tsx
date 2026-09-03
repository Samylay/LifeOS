"use client";

// One saved-content card. T-decide-rework-04: the card leads with the single
// ACTION it would trigger and states, in plain terms, what happens on approval
// — Samy approves an outcome, not an opinion. The assessment below it stops
// rating the item and starts justifying that action.
//
// A card is only rendered for a decidable item (proposedAction() resolves).
// The deck withholds the rest rather than showing an undecidable card.
import { Archive, ExternalLink, Lightbulb, ListTodo, Map, Trash2, HelpCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { categoryMeta } from "@/components/decide/category-colors";
import { cn } from "@/lib/utils";
import {
  ACTIONS,
  actionKey,
  describeEffect,
  selectableActions,
  type Action,
  type ActionId,
} from "@/lib/decide/actions";
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

const ACTION_ICONS: Record<ActionId, LucideIcon> = {
  "file-vault": Archive,
  "file-idea-bank": Lightbulb,
  "file-backlog": ListTodo,
  "file-roadmap": Map,
  discard: Trash2,
  "hold-for-review": HelpCircle,
};

const VERDICT_COLORS: Record<string, string> = {
  pursue: "var(--success)", adopt: "var(--success)",
  maybe: "var(--warning)", try: "var(--warning)",
  skim: "var(--muted-foreground)",
  pass: "var(--destructive)", skip: "var(--destructive)",
};

// Confidence dot beside the action — a glanceable "how sure was the study
// step about THIS action" instead of prose.
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

function actionLabel(action: Action): string {
  const base = ACTIONS.find((d) => d.id === action.id)?.label ?? action.id;
  return action.id === "file-backlog" ? `${action.params.centre} backlog` : base;
}

export function TriageCard({
  item,
  action,
  onChangeAction,
}: {
  item: TriageQueueItem;
  /** The action approving this card would commit — the proposal, or Samy's
   *  correction of it. */
  action: Action | null;
  /** Correcting the action is one tap; approving is still the next gesture. */
  onChangeAction?: (action: Action) => void;
}) {
  const p = item.proposal ?? {};
  const a = p.assessment;
  const cat = categoryMeta(p.category);
  const CatIcon = cat.icon;
  const isBiz = p.category === "business-idea";
  const ActionIcon = action ? ACTION_ICONS[action.id] : HelpCircle;
  const currentKey = action ? actionKey(action) : "";
  // Only offer a correction when there is a real alternative to correct to.
  const alternatives = onChangeAction ? selectableActions(item) : [];
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

      {action && (
        // The card's primary content: the action, then its effect in plain
        // words. Approving commits exactly this.
        <div className="space-y-1 rounded-lg border border-primary/25 bg-primary/[0.06] p-3">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <ActionIcon size={14} aria-hidden className="text-primary" />
            {actionLabel(action)}
            <span
              aria-label={p.confidence ? `confidence: ${p.confidence}` : undefined}
              title={p.confidence ? `confidence: ${p.confidence}` : undefined}
              className="ml-auto h-1.5 w-1.5 rounded-full"
              style={{ background: confidenceColor }}
            />
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {describeEffect(action, item)}
          </p>
          {alternatives.length > 1 && (
            // One tap re-aims the card. The chips sit inside the banner so
            // correcting and approving read as the same decision.
            <div className="flex flex-wrap gap-1.5 pt-1.5">
              {alternatives.map((alt) => {
                const key = actionKey(alt);
                const AltIcon = ACTION_ICONS[alt.id];
                const isCurrent = key === currentKey;
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={isCurrent}
                    onClick={() => onChangeAction?.(alt)}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-transform duration-150 active:scale-[0.97] max-lg:[min-height:32px]",
                      isCurrent
                        ? "border-primary/50 bg-primary/10 text-foreground"
                        : "border-border text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <AltIcon size={11} aria-hidden /> {actionLabel(alt)}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {a && (
        // Why that action, not a rating of the item.
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

      <a href={item.url} target="_blank" rel="noreferrer"
        className="inline-flex items-center gap-1 text-xs font-medium text-primary transition-transform duration-150 active:scale-[0.97]">
        <ExternalLink size={12} /> open original
      </a>
    </div>
  );
}

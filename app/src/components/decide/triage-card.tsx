"use client";

// One saved-content card. T-decide-rework-04: the card leads with the single
// ACTION it would trigger and states, in plain terms, what happens on approval
// — Samy approves an outcome, not an opinion. The assessment below it stops
// rating the item and starts justifying that action.
//
// A card is only rendered for a decidable item (proposedAction() resolves).
// The deck withholds the rest rather than showing an undecidable card.
import { Fragment } from "react";
import { Wrench, Bookmark, Archive, Lightbulb, ListTodo, Map, Trash2, HelpCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { CompactText } from "@/components/ui/compact-text";
import { ContextDetails, Provenance } from "@/components/ui/decision-context";
import { Badge } from "@/components/ui/badge";
import { categoryMeta } from "@/components/decide/category-colors";
import { cn } from "@/lib/utils";
import {
  actionKey,
  actionLabel,
  describeEffect,
  selectableDecideActions,
  type Action,
  type ActionId,
} from "@/lib/decide/homelab-actions";
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
  "homelab-skill": Wrench,
  "homelab-reference": Bookmark,
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
  // The card's own action is always among the chips, so a card that arrived
  // with no resolvable action still has somewhere to go.
  const alternatives = onChangeAction ? selectableDecideActions(item, action) : [];
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
        <CompactText text={p.summary} limit={160} className="text-muted-foreground" />
      )}

      {(action || alternatives.length > 0) && (
        // The card's primary content: the action, then its effect in plain
        // words. Approving commits exactly this. When nothing resolved, the
        // banner asks for a pick instead of hiding the card — a card with no
        // gesture is the backlog this deck refuses to hold.
        <div className="space-y-1 rounded-lg border border-primary/25 bg-primary/[0.06] p-3">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <ActionIcon size={14} aria-hidden className="text-primary" />
            {action ? actionLabel(action) : "Pick an action"}
            <span
              aria-label={p.confidence ? `confidence: ${p.confidence}` : undefined}
              title={p.confidence ? `confidence: ${p.confidence}` : undefined}
              className="ml-auto h-1.5 w-1.5 rounded-full"
              style={{ background: confidenceColor }}
            />
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {action
              ? describeEffect(action, item, { compact: true })
              : "Choose a destination, then approve."}
          </p>
          {alternatives.length > 0 && (
            // One tap re-aims the card. The chips sit inside the banner so
            // correcting and approving read as the same decision.
            <div className="flex flex-wrap gap-1.5 pt-1.5">
              {alternatives.map((alt) => {
                const key = actionKey(alt);
                const AltIcon = ACTION_ICONS[alt.id];
                const isCurrent = key === currentKey;
                return (
                  <Fragment key={key}>
                  {alt.id === "homelab-skill" && <span className="w-full pt-1 text-[11px] font-medium text-muted-foreground">Homelab</span>}
                  <button
                    type="button"
                    aria-pressed={isCurrent}
                    onClick={() => onChangeAction?.(alt)}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-transform duration-[var(--dur-fast)] ease-[var(--ease-out-custom)] active:scale-[0.97] min-h-9 max-lg:[min-height:44px]",
                      isCurrent
                        ? "border-primary/50 bg-primary/10 text-foreground"
                        : "border-border text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <AltIcon size={11} aria-hidden /> {actionLabel(alt)}
                  </button>
                  </Fragment>
                );
              })}
            </div>
          )}
        </div>
      )}

      {a?.payoff && <CompactText text={`Payoff: ${a.payoff}`} limit={120} className="text-muted-foreground" />}
      <ContextDetails label="Why this recommendation">
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

      <Field label="For you:" value={p.why_relevant} />
      {p.rationale && <Field label="Reason:" value={p.rationale} />}
      </ContextDetails>

      {/^https?:\/\//.test(item.url) && <Provenance label="Open source" href={item.url} />}
    </div>
  );
}

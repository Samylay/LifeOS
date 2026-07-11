// PROTOTYPE — adaptive UI for approved triage cards. Throwaway; answers
// "when an approved card opens into a UI shaped by its own suggestion,
// what does that look like?" Delete or absorb once the architecture talk
// happens. No personal content lives in this file: item specs are generated
// on the host (services/triage/adaptive-spec-prototype.py) and stored in the
// `users/local/adaptivePrototype` collection, keyed by triage item id.

import type { TriageQueueItem } from "@/components/decide/triage-card";

// One generated view spec = which template + the slots that template reads.
// The generator may omit any slot; templates collapse missing sections.
export interface AdaptiveSpec {
  template: TemplateName;
  eyebrow?: string; // one-line context ("Anthropic guide · saved from X")
  headline?: string; // action-oriented: what acting on this item means
  reading?: { heading: string; body: string }[]; // inline digest — read here, not on X/IG
  facts?: { label: string; value: string }[]; // effort / payoff / confidence…
  steps?: { text: string; detail?: string }[]; // the suggestion as a checklist
  stack?: { project: string; how: string }[]; // study: where it lands in Samy's stack
  selftest?: string; // study: one question to check the technique stuck
  risk?: string; // validate: the main way this wastes time
  cta?: { label: string; kind: "open-source" | "research" | "log-backlog" };
}

export type TemplateName = "explore" | "study" | "validate" | "file";

// The registry — the "recurring UIs are saved somewhere" hint made concrete.
// A future architecture would let the generator mint new templates and save
// them here; the prototype ships four hand-built shapes and lets the
// generator only CHOOSE + FILL them.
export const TEMPLATE_REGISTRY: Record<
  TemplateName,
  { label: string; pickWhen: string }
> = {
  explore: {
    label: "Reading room",
    pickWhen:
      "ai-tip / ai-project — the suggestion is 'read/skim/try this'; the source digest is shown inline so acting starts here, not on the original link.",
  },
  study: {
    label: "Study card",
    pickWhen:
      "swe — a technique to retain: distilled claims, where it applies in the stack, one self-test question.",
  },
  validate: {
    label: "Validation bench",
    pickWhen:
      "business-idea — a verdict to interrogate: demand/effort/payoff side by side, kill criteria, research affordance.",
  },
  file: {
    label: "Filing slip",
    pickWhen: "other / no assessment — nothing to work through; confirm where it landed.",
  },
};

// Fallback when an item has no generated spec (legacy pre-enrichment items):
// derive a minimal spec from the proposal fields alone, client-side.
export function fallbackSpec(item: TriageQueueItem): AdaptiveSpec {
  const p = item.proposal ?? {};
  const a = p.assessment;
  const byCategory: Record<string, TemplateName> = {
    "ai-tip": "explore",
    "ai-project": "explore",
    swe: "study",
    "business-idea": "validate",
  };
  return {
    template: byCategory[p.category ?? ""] ?? "file",
    headline: p.title ?? p.summary ?? item.url,
    eyebrow: `${item.source} · filed`,
    reading: p.summary ? [{ heading: "What it is", body: p.summary }] : [],
    facts: [
      ...(a?.effort ? [{ label: "Effort", value: a.effort }] : []),
      ...(a?.payoff ? [{ label: "Payoff", value: a.payoff }] : []),
      ...(p.confidence ? [{ label: "Confidence", value: p.confidence }] : []),
    ],
    steps: a?.apply && a.apply !== "none" ? [{ text: a.apply }] : [],
  };
}

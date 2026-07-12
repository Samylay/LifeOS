// PROTOTYPE — adaptive UI for approved triage cards. Now a template BANK
// (Samy's 2026-07-12 ruling): the four original shapes live here as seed
// data, and the generator may MINT new templates — a minted template is a
// named composition of the renderable primitives below, stored in
// `users/local/adaptiveTemplateBank` (runtime data, never committed; this
// repo is public). The interpreter renders only whitelisted blocks, so a
// mint can never introduce code or markup. No personal content in this file:
// item specs are generated on the host (services/triage/
// adaptive-spec-prototype.py) and stored in `users/local/adaptivePrototype`.

import type { TriageQueueItem } from "@/components/decide/triage-card";

// One generated view spec = which template (by bank name) + the slots that
// template's blocks read. The generator may omit any slot; blocks whose slot
// is empty collapse.
export interface AdaptiveSpec {
  template: string;
  eyebrow?: string; // one-line context ("Anthropic guide · saved from X")
  headline?: string; // action-oriented: what acting on this item means
  reading?: { heading: string; body: string }[]; // inline digest — read here, not on X/IG
  facts?: { label: string; value: string }[]; // effort / payoff / confidence…
  steps?: { text: string; detail?: string }[]; // the suggestion as a checklist
  stack?: { project: string; how: string }[]; // where it lands in Samy's stack
  selftest?: string; // one question to check the technique stuck
  risk?: string; // the main way this wastes time
  cta?: { label: string; kind: "open-source" | "research" | "log-backlog" };
}

/* ---------- renderable primitives (the safety boundary) ----------
 * A template's layout is an ordered list of these blocks. The interpreter
 * (templates.tsx) renders ONLY these; unknown block types are skipped. A
 * minted template is therefore always safely renderable JSON — never
 * arbitrary code/HTML. Adding a primitive is a code change by design.
 */
export type BlockDef =
  | { block: "header"; icon?: IconName }
  | { block: "reading"; style?: "prose" | "claims"; heading?: string }
  | { block: "facts"; style?: "pills" | "grid" }
  | { block: "verdict" } // banner: item's verdict + reading[0].body
  | { block: "risk" }
  | { block: "stack"; heading?: string }
  | { block: "selftest" }
  | { block: "steps"; heading?: string }
  | { block: "cta" }
  | { block: "link" };

export type IconName =
  | "book" | "graduation" | "flask" | "inbox" | "search"
  | "wrench" | "lightbulb" | "compass" | "target" | "layers";

export const BLOCK_TYPES = [
  "header", "reading", "facts", "verdict", "risk",
  "stack", "selftest", "steps", "cta", "link",
] as const;

export interface TemplateDef {
  name: string; // kebab-case bank key
  label: string; // human name shown on the card chip
  pickWhen: string; // guidance the generator matches against
  layout: BlockDef[];
  // present on minted templates only:
  mintedAt?: string;
  mintedFor?: string; // triage item id that prompted the mint
  mintReason?: string; // why the existing bank didn't fit — feeds later pruning
}

/* ---------- the seed bank: the four original shapes, as data ---------- */

export const SEED_TEMPLATES: TemplateDef[] = [
  {
    name: "explore",
    label: "Reading room",
    pickWhen:
      "ai-tip / ai-project — the suggestion is 'read/skim/try this'; the source digest is shown inline so acting starts here, not on the original link.",
    layout: [
      { block: "header", icon: "book" },
      { block: "reading", style: "prose" },
      { block: "facts", style: "pills" },
      { block: "steps", heading: "Do this" },
      { block: "link" },
    ],
  },
  {
    name: "study",
    label: "Study card",
    pickWhen:
      "swe — a technique to retain: distilled claims, where it applies in the stack, one self-test question.",
    layout: [
      { block: "header", icon: "graduation" },
      { block: "reading", style: "claims" },
      { block: "stack", heading: "Where this lands in your stack" },
      { block: "selftest" },
      { block: "steps" },
      { block: "link" },
    ],
  },
  {
    name: "validate",
    label: "Validation bench",
    pickWhen:
      "business-idea — a verdict to interrogate: demand/effort/payoff side by side, kill criteria, research affordance.",
    layout: [
      { block: "header", icon: "flask" },
      { block: "verdict" },
      { block: "facts", style: "grid" },
      { block: "risk" },
      { block: "steps", heading: "Before building anything" },
      { block: "cta" },
      { block: "link" },
    ],
  },
  {
    name: "file",
    label: "Filing slip",
    pickWhen:
      "other / no assessment — nothing to work through; confirm where it landed.",
    layout: [
      { block: "header", icon: "inbox" },
      { block: "reading", style: "prose" },
      { block: "link" },
    ],
  },
];

const VALID_ICONS: ReadonlySet<string> = new Set([
  "book", "graduation", "flask", "inbox", "search",
  "wrench", "lightbulb", "compass", "target", "layers",
] satisfies IconName[]);

// Defensive gate for bank docs coming out of the DB: minted templates were
// validated at mint time on the host, but the interpreter must never trust
// stored JSON. Drops unknown blocks/icons rather than rejecting the template.
export function sanitizeTemplate(raw: unknown): TemplateDef | null {
  if (!raw || typeof raw !== "object") return null;
  const t = raw as Record<string, unknown>;
  if (typeof t.name !== "string" || !/^[a-z0-9-]{2,40}$/.test(t.name)) return null;
  if (typeof t.label !== "string" || !Array.isArray(t.layout)) return null;
  const layout: BlockDef[] = [];
  for (const b of t.layout.slice(0, 12)) {
    if (!b || typeof b !== "object") continue;
    const block = (b as { block?: unknown }).block;
    if (typeof block !== "string" || !(BLOCK_TYPES as readonly string[]).includes(block)) continue;
    const def = { ...(b as object) } as BlockDef & { icon?: string };
    if ("icon" in def && def.icon !== undefined && !VALID_ICONS.has(def.icon)) delete def.icon;
    layout.push(def as BlockDef);
  }
  if (layout.length === 0) return null;
  return {
    name: t.name,
    label: t.label.slice(0, 40),
    pickWhen: typeof t.pickWhen === "string" ? t.pickWhen.slice(0, 300) : "",
    layout,
    mintedAt: typeof t.mintedAt === "string" ? t.mintedAt : undefined,
    mintedFor: typeof t.mintedFor === "string" ? t.mintedFor : undefined,
    mintReason: typeof t.mintReason === "string" ? t.mintReason.slice(0, 500) : undefined,
  };
}

// Merged bank: seeds + sanitized minted docs (mints may not shadow seeds).
export function mergeBank(mintedDocs: unknown[]): Map<string, TemplateDef> {
  const bank = new Map(SEED_TEMPLATES.map((t) => [t.name, t]));
  for (const raw of mintedDocs) {
    const t = sanitizeTemplate(raw);
    if (t && !bank.has(t.name)) bank.set(t.name, t);
  }
  return bank;
}

// Fallback when an item has no generated spec (legacy pre-enrichment items):
// derive a minimal spec from the proposal fields alone, client-side.
export function fallbackSpec(item: TriageQueueItem): AdaptiveSpec {
  const p = item.proposal ?? {};
  const a = p.assessment;
  const byCategory: Record<string, string> = {
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

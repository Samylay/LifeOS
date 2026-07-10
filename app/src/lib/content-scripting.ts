// Monday scripting block, automated: turn a banked idea into a first-draft
// script + caption via `claude -p`. Mirrors the vault playbook exactly —
// skeletons from 03-hook-script-library.md, caption conventions from
// 05-publishing-engagement.md, voice from 01-brand-foundation.md. The vault
// stays the source of truth; if it changes materially, update here.
//
// This module is pure (client-safe): prompt construction, output shaping,
// and the weekly batch plan. The actual model call is injected — the API
// route passes `generateJson` from claude-cli.ts.
import type { ContentIdea, ContentPillar } from "./types";
import { HOOK_FORMULAS, NON_NEGOTIABLES } from "./content-os";

// --- Skeletons (03-hook-script-library.md, verbatim beats) -----------------

export const SCRIPT_SKELETONS: Record<
  ContentPillar,
  { label: string; length: string; beats: string[] }
> = {
  "workflow-win": {
    label: "Workflow Win",
    length: "15–30s, ~65–80 words total",
    beats: [
      "[0–2s]  HOOK — keyword spoken + on screen",
      '[2–6s]  STAKES — why the manual way costs you ("this used to eat my afternoons")',
      "[6–22s] THE WORKFLOW — 3 steps max, screen recording synced to voice, one zoom per step, captions 1–3 words",
      "[22–28s] PROOF — the before/after number",
      '[28–30s] CTA — "Save this for your next build" or "Send this to whoever is ___"',
    ],
  },
  "build-log": {
    label: "Build Log episode",
    length: "30–60s, ~110–150 words total",
    beats: [
      "[0–3s]   HOOK — episode number + tension",
      '[3–10s]  CONTEXT — one sentence on what you\'re building ("the automation engine that turns plain English into workflows") + today\'s goal',
      "[10–35s] WHAT HAPPENED — AI's role, the surprise or failure (✗ marker), real screen footage",
      "[35–50s] THE LESSON — transferable rule, stated as a verdict",
      '[50–60s] SERIAL CTA — "Follow for Build Log [n+1] — next up: ___" (always tease the next episode)',
    ],
  },
  "under-the-hood": {
    label: "Under the Hood carousel",
    length: "5–10 slides, ≤30 words per slide",
    beats: [
      'Slide 1: One hard claim, huge type ("Your agent doesn\'t need more context. It needs a smaller job.")',
      "Slide 2: The problem, one stat or scenario",
      "Slides 3–7: The anatomy — one concept per slide, diagram > text, ≤30 words per slide",
      "Slide 8: The mistake most people make (contrast)",
      "Slide 9: Recap in 3 bullets",
      'Slide 10: CTA — "Send this to a builder" + follow',
    ],
  },
};

// Voice rules from 01-brand-foundation.md, condensed for the prompt.
const VOICE_RULES = [
  "Calm, specific, numbers over adjectives (\"cut a 40-min task to 4\") — never hype adjectives (\"insane\", \"mind-blowing\", \"game-changer\")",
  "Admit cost and failure; never pretend everything worked first try",
  "Speak dev-to-dev, assume competence — never explain what an IDE is",
  "Opinionated verdicts (\"skip this, do that\") — no both-sides hedging",
  "Short sentences. Cut the setup. No intros (\"hey guys\") — the first line IS the hook",
  "Banned words: \"unlock\", \"supercharge\", \"10x your productivity\", model version numbers in hooks",
];

// --- Prompt -----------------------------------------------------------------

export interface ScriptableIdea {
  title: string;
  pillar: ContentPillar;
  hookFormula: number;
  episode?: number;
  notes?: string;
}

export interface ScriptDraft {
  script: string;
  caption: string;
}

// Raw shape we ask the model for; normalized before it touches the store.
interface RawScriptDraft {
  hook?: string;
  script?: string;
  caption?: string;
  keyword?: string;
  hashtags?: string[];
}

export function buildScriptPrompt(idea: ScriptableIdea): string {
  const skeleton = SCRIPT_SKELETONS[idea.pillar];
  const hook = HOOK_FORMULAS.find((h) => h.n === idea.hookFormula);
  if (!hook) throw new Error(`unknown hook formula ${idea.hookFormula}`);
  const isCarousel = idea.pillar === "under-the-hood";
  const isBuildLog = idea.pillar === "build-log";

  const lines = [
    "You are ghost-drafting a short-form post for a faceless build-in-public brand:",
    "a solo dev building a natural-language automation product with AI as the",
    "engineering team, teaching one transferable AI workflow per post. Voice is his",
    "own (he records it himself); write words he can read aloud as-is.",
    "",
    "Voice rules:",
    ...VOICE_RULES.map((r) => `- ${r}`),
    "",
    "Non-negotiables (hard constraints):",
    ...NON_NEGOTIABLES.map((r) => `- ${r}`),
    "- The hook must NOT contain any tool, product, or model name — problems are evergreen, tools rot. Tool names are allowed (and good for SEO) in the caption only.",
    ...(isBuildLog
      ? ["- The lesson must work for someone who will never see his product."]
      : []),
    "",
    `Format: ${skeleton.label} (${skeleton.length}). Follow this exact skeleton:`,
    ...skeleton.beats.map((b) => `  ${b}`),
    "",
    `Hook formula #${hook.n} — ${hook.name}: "${hook.template}"`,
    "The first line of the script must be a concrete instantiation of that template",
    "for this idea (fill the blanks; do not describe the formula). Speak the TikTok",
    "SEO keyword inside the first 3 seconds.",
    "",
    `Idea: ${idea.title}`,
    ...(isBuildLog && idea.episode != null
      ? [
          `Build Log episode number: ${idea.episode}. The serial CTA must tease Build Log ${idea.episode + 1}.`,
        ]
      : []),
    ...(idea.notes ? [`Notes / beats to work in: ${idea.notes}`] : []),
    "",
    "First drafts over-explain — write it, then cut 15% before answering. Word",
    "counts matter: 30s ≈ 75 words at speaking pace.",
    "",
    "Caption conventions (both platforms share one caption):",
    "- Line 1: the claim/question with the SEO keyword phrased naturally in the first 50 characters",
    "- Then 2–3 short sentences of context or key steps (keywords in prose; tool names welcome here)",
    ...(isBuildLog
      ? [`- Last line CTA: follow for the next episode (serial content earns follows)`]
      : [`- Last line CTA: a save or send CTA ("Save this for your next build" / "Send this to a builder who needs it")`]),
    "- hashtags: 3–5, one containing the keyword verbatim, plus niche/adjacent tags and buildinpublic. No broad bait tags (#fyp is dead weight). Do NOT put the hashtags in the caption text; return them separately.",
    "",
    "Respond with ONLY a JSON object, no prose, of the shape:",
    `{"hook": string, "script": string, "caption": string, "keyword": string, "hashtags": string[]}`,
    "- hook: the finished hook line (also the script's first line)",
    isCarousel
      ? '- script: the full carousel, one slide per line as "Slide N: <text>" (5–10 slides, ≤30 words each)'
      : '- script: the full voiceover script, one paragraph per beat, starting with the hook line. Mark the failure beat with ✗ if one is shown.',
    "- caption: the caption text WITHOUT hashtags",
    "- keyword: the TikTok SEO keyword phrase the script targets",
    "- hashtags: 3–5 tags, without the # prefix or with, either is fine",
  ];
  return lines.join("\n");
}

// --- Caption / hashtag formatting (05-publishing-engagement.md) -------------

/** "#AI Code Refactoring" → "aicoderefactoring" */
function tagify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Normalize model-suggested hashtags to the 05 conventions: 3–5 tags, one
 * containing the keyword verbatim, always #buildinpublic, no dupes, no #fyp.
 */
export function normalizeHashtags(raw: string[] | undefined, keyword?: string): string[] {
  const banned = new Set(["fyp", "foryou", "foryoupage", "viral"]);
  const tags: string[] = [];
  const push = (t: string) => {
    const clean = tagify(t);
    if (clean && !banned.has(clean) && !tags.includes(clean)) tags.push(clean);
  };
  if (keyword) push(keyword); // keyword-verbatim tag comes first
  for (const t of raw ?? []) push(t);
  push("buildinpublic");
  // Floor of 3: pad from the brand's evergreen tag pool if the model was terse.
  for (const filler of ["aiworkflow", "devworkflow"]) {
    if (tags.length >= 3) break;
    push(filler);
  }
  return tags.slice(0, 5).map((t) => `#${t}`);
}

/** Caption text + a blank line + the hashtag row, per the 05 templates. */
export function composeCaption(caption: string, hashtags: string[]): string {
  const body = caption.trim();
  const row = hashtags.join(" ");
  return row ? `${body}\n\n${row}` : body;
}

// --- Generation --------------------------------------------------------------

/**
 * Draft script + caption for one idea. `generate` is the model call —
 * pass `generateJson` from claude-cli.ts (server-side only).
 */
export async function draftScriptForIdea(
  idea: ScriptableIdea,
  generate: <T>(prompt: string) => Promise<T>
): Promise<ScriptDraft> {
  const raw = await generate<RawScriptDraft>(buildScriptPrompt(idea));
  const script = (raw.script ?? "").trim();
  if (!script) throw new Error("model returned no script");
  // The hook is the script's first line; prepend it if the model split them.
  const hook = (raw.hook ?? "").trim();
  const full = hook && !script.includes(hook) ? `${hook}\n\n${script}` : script;
  const caption = composeCaption(
    (raw.caption ?? "").trim() || idea.title,
    normalizeHashtags(raw.hashtags, raw.keyword)
  );
  return { script: full, caption };
}

// --- Weekly batch plan (WEEKLY_RHYTHM / PILLARS cadence + bank floor) --------

/** Unscripted-ideas floor from KILL_SCALE_RULES: "never let unscripted ideas drop below 12". */
export const BANK_FLOOR = 12;

/**
 * Weekly quota in KEEP priority order (02-content-strategy.md cut order:
 * "carousel first, then one Build Log. Never cut the Workflow Win.").
 */
export const WEEKLY_SLOTS: ContentPillar[] = [
  "workflow-win",
  "build-log",
  "build-log",
  "under-the-hood",
];

export interface BatchPlan {
  toGenerate: ContentIdea[];
  blocked: { pillar: ContentPillar; reason: string }[];
  unscripted: number; // ideas with status "idea" before generating
}

/**
 * Pick this week's batch from the bank: next unscripted idea per slot, in bank
 * order, hook formula required (an idea without one is a topic, not a post).
 * Respects the 12-idea floor — if generating the full batch would drain the
 * bank below it, only the safe count is generated (in keep-priority order)
 * and the rest is reported blocked.
 */
export function planWeeklyBatch(ideas: ContentIdea[]): BatchPlan {
  const unscripted = ideas.filter((i) => i.status === "idea").length;
  const picked: ContentIdea[] = [];
  const blocked: BatchPlan["blocked"] = [];

  for (const pillar of WEEKLY_SLOTS) {
    const candidate = ideas.find(
      (i) =>
        i.status === "idea" &&
        i.pillar === pillar &&
        !!i.hookFormula &&
        !picked.includes(i)
    );
    if (candidate) picked.push(candidate);
    else
      blocked.push({
        pillar,
        reason: `no unscripted ${pillar} idea with a hook formula in the bank`,
      });
  }

  const safe = Math.max(0, unscripted - BANK_FLOOR);
  const toGenerate = picked.slice(0, safe);
  for (const idea of picked.slice(safe)) {
    blocked.push({
      pillar: idea.pillar as ContentPillar, // picked ideas matched a WEEKLY_SLOTS pillar, so never ""
      reason: `bank floor: scripting "${idea.title}" would drop unscripted ideas below ${BANK_FLOOR} — bank more ideas first`,
    });
  }

  return { toGenerate, blocked, unscripted };
}

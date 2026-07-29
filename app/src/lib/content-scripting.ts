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

// --- Skeletons (July-18 repositioning: "AI, from a few steps ahead") --------
// Key → meaning: under-the-hood = Concept (90s explainer video, the channel
// core), build-log = Built It (standalone project story, no serial),
// workflow-win = Gotcha / quick win demo.

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
    label: "Built It — project story",
    length: "30–60s, ~110–150 words total",
    beats: [
      "[0–3s]   HOOK — the result or the tension, up front",
      "[3–10s]  CONTEXT — one sentence on the project, fully standalone (no series lore, no episode numbering)",
      "[10–35s] WHAT HAPPENED — the concept doing real work, the surprise or failure (✗ marker), real screen footage",
      "[35–50s] THE LESSON — transferable rule, stated as a verdict",
      '[50–60s] CTA — save or send ("Send this to a builder who needs it")',
    ],
  },
  "under-the-hood": {
    label: "Concept explainer",
    length: "60–90s vertical video, ~150–220 words total",
    beats: [
      "[0–3s]   HOOK — one hard claim or question, keyword spoken + on screen",
      "[3–15s]  WHY IT MATTERS — the concrete problem you hit when you don't get this",
      "[15–60s] THE CONCEPT — what X actually is, one mental model, explained a few steps ahead; diagram or screen recording carries the structure, the voice stays narrative",
      "[60–75s] THE MISTAKE — what most people get wrong (contrast)",
      '[75–90s] CTA — "Send this to a builder" or save, plus a one-line tease of the next concept in the path',
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

// Anti-slop rules (hardikpandya/stop-slop, adopted 2026-07-21) — the AI tells
// Samy vetoes in finished scripts; the voice rules above say what to sound
// like, these say what to never emit.
export const ANTI_SLOP_RULES = [
  'No binary-contrast reveals: "isn\'t X, it\'s Y", "not because X, but Y", "the answer isn\'t X". State the point directly.',
  'No throat-clearing: "Here\'s the thing/what/why", "the truth is", "let me be clear". Cut straight to the content.',
  'No filler adverbs: "actually", "just", "really", "literally", "simply", "genuinely", "honestly".',
  'No lazy extremes doing vague work: "everyone", "always", "never", "nobody". Name who specifically.',
  "No em dashes in spoken lines or captions — use a period, comma, or colon.",
  'No manufactured punch: "Full stop.", "Let that sink in.", "This matters because", pull-quote one-liners.',
  // Samy's ear, 2026-07-22: enumeration cadence is the loudest AI tell in spoken VO.
  'No enumeration scaffolding in spoken lines: never "X is three things. First… Second… Third…", no recap triads ("brain, tools, loop"), no numbered labels. Visuals carry structure; the voice stays narrative.',
] as const;

// Spoken register (2026-07-22): scripts are read aloud — write for the mouth,
// not the page. Modeled on how top tech creators actually talk.
export const SPOKEN_REGISTER_RULES = [
  "Contractions always: \"it's\", \"there's\", \"job's done\" — an uncontracted \"it is\" reads as text-to-speech.",
  'Second person: talk TO the viewer ("read your files"), not about the world.',
  'Verbs over noun phrases: "it can do stuff" beats "it gains capabilities".',
  'Fragments where the breath falls: "Tests pass? It commits, and goes back to sleep." One per beat at most.',
  "Every sentence must survive being said aloud in one breath — if you'd rewrite it while recording, rewrite it now.",
] as const;

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
    "Anti-slop rules (violating any of these fails the draft):",
    ...ANTI_SLOP_RULES.map((r) => `- ${r}`),
    "",
    "Spoken register (the script is read aloud):",
    ...SPOKEN_REGISTER_RULES.map((r) => `- ${r}`),
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
    ...(idea.notes ? [`Notes / beats to work in: ${idea.notes}`] : []),
    "",
    "First drafts over-explain — write it, then cut 15% before answering. Word",
    "counts matter: 30s ≈ 75 words at speaking pace.",
    "",
    "Caption conventions (both platforms share one caption):",
    "- Line 1: the claim/question with the SEO keyword phrased naturally in the first 50 characters",
    "- Then 2–3 short sentences of context or key steps (keywords in prose; tool names welcome here)",
    `- Last line CTA: a save or send CTA ("Save this for your next build" / "Send this to a builder who needs it")`,
    "- hashtags: 3–5, one containing the keyword verbatim, plus niche/adjacent tags and buildinpublic. No broad bait tags (#fyp is dead weight). Do NOT put the hashtags in the caption text; return them separately.",
    "",
    "Respond with ONLY a JSON object, no prose, of the shape:",
    `{"hook": string, "script": string, "caption": string, "keyword": string, "hashtags": string[]}`,
    "- hook: the finished hook line (also the script's first line)",
    '- script: the full voiceover script, one paragraph per beat, starting with the hook line. Mark the failure beat with ✗ if one is shown.',
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

// --- Weekly batch plan (PILLARS cadence + bank floor) ------------------------

/** Unscripted-ideas floor (vault kill/scale rules): never let unscripted ideas drop below 12. */
export const BANK_FLOOR = 12;

/**
 * Weekly quota in KEEP priority order. Concept explainers (under-the-hood key)
 * are the channel core and are never cut first; the quick-win Gotcha demo is
 * the first to go when the bank floor bites.
 */
export const WEEKLY_SLOTS: ContentPillar[] = [
  "under-the-hood",
  "under-the-hood",
  "build-log",
  "workflow-win",
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

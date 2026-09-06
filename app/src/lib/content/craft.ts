// The craft material — script skeletons, anti-slop rules and spoken-register
// rules. These used to be inputs to a generator; the generator is gone
// (T-content-rework-01) and this survives as reference Samy reads.
//
// Kept verbatim from content-scripting.ts rather than rewritten: it is his
// own accumulated judgement about what makes these posts work, and deleting
// it with the generator would have thrown away the only part worth keeping.
import type { ContentPillar } from "@/lib/types";

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

// Voice rules from 01-brand-foundation.md. Reference for Samy when he writes,
// no longer an input to anything that writes for him.
export const VOICE_RULES = [
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

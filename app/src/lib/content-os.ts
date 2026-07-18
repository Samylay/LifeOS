// Static playbook data for the Content OS section. Source of truth is the
// Obsidian vault (01-Inbox/content-os/); this mirrors the parts the app
// needs to render and seed. If the vault docs change materially, update here.
import type { ContentPillar, ContentIdea } from "./types";

// Positioning (2026-07-18): "AI, from a few steps ahead" — teach coders
// entering AI one scarce concept per 60–90s video, in a peer voice (not a tech
// lead), grounded in things Samy actually built. The build-in-public "Build Log"
// diary was scrapped. NOTE: the underlying pillar KEYS are unchanged
// (build-log/workflow-win/under-the-hood) because content-scripting.ts + its
// tests + the weekly scheduler are wired to them; only their MEANING/labels
// changed here. Key → new meaning:
//   under-the-hood → Concept   (the front door: "what X actually is")
//   build-log      → Built It  (the concept working in something Samy built)
//   workflow-win   → Gotcha    (the thing nobody tells you / a real trap)
export const PILLARS: {
  pillar: ContentPillar;
  label: string;
  short: string;
  job: string;
  cadence: string;
  color: string;
}[] = [
  {
    pillar: "under-the-hood",
    label: "Concept",
    short: "CN",
    job: "The front door — 'what X actually is', explained a few steps ahead. Core of the channel.",
    cadence: "most videos",
    color: "#6366F1",
  },
  {
    pillar: "build-log",
    label: "Built It",
    short: "BI",
    job: "Proof — the concept running in something Samy actually built. Credibility, not diary.",
    cadence: "~1 in 4",
    color: "#7C9E8A",
  },
  {
    pillar: "workflow-win",
    label: "Gotcha",
    short: "GT",
    job: "The thing nobody tells you / this tripped me up — punchy, high-save TIL.",
    cadence: "~1 in 4",
    color: "#FFB454",
  },
];

export const PILLAR_META = Object.fromEntries(
  PILLARS.map((p) => [p.pillar, p])
) as Record<ContentPillar, (typeof PILLARS)[number]>;

export const HOOK_FORMULAS: { n: number; name: string; template: string }[] = [
  { n: 1, name: "Cost of ignorance", template: "You're paying for ___ you could build in ___" },
  { n: 2, name: "Received wisdom is wrong", template: "Everyone tells you to ___. On a real repo, that fails." },
  { n: 3, name: "Time collapse", template: "This took me ___. Now it takes ___." },
  { n: 4, name: "Series thread", template: "Part ___: [the concept] — in 90 seconds." },
  { n: 5, name: "Confession", template: "I wasted ___ so you don't have to." },
  { n: 6, name: "Threshold", template: "If you're still ___-ing manually, watch this." },
  { n: 7, name: "Anatomy", template: "Here's exactly how ___ works, in ___ seconds." },
  { n: 8, name: "Verdict", template: "I tested ___ for a week on a real project. Verdict:" },
  { n: 9, name: "Impossible demo", template: "Cold open on the result, 2s silent, then 'here's how'" },
  { n: 10, name: "The one rule", template: "One rule changed how I ___ with AI." },
  { n: 11, name: "Watch it break", template: "I let AI ___ unsupervised. Watch what happened." },
  { n: 12, name: "Sender bait", template: "Send this to whoever is ___" },
];

export const WEEKLY_RHYTHM: { day: string; block: string; time: string; what: string }[] = [
  { day: "Mon", block: "Script", time: "1.5h", what: "Write the next few scripts (mostly Concept, ~1 Built-It or Gotcha), assign hook formulas, read aloud, cut 15%, write captions now" },
  { day: "Tue", block: "Record", time: "1.5h", what: "All voiceovers in one sitting (stand up, 2 takes each), then the screen captures / diagram builds" },
  { day: "Wed", block: "Edit", time: "2.5h", what: "~40 min/video in the CapCut master template. Kill-rule: fighting past 50 min → ship rough or drop" },
  { day: "Tue–Sun", block: "Publish", time: "1h total", what: "4 posts from last week's batch, per the posting map" },
  { day: "Daily", block: "Engage", time: "15–20 min", what: "Reply to every comment; comment on 5 niche accounts (add information, not applause)" },
  { day: "Fri", block: "Review", time: "20 min", what: "Log metrics, best/worst by sends per reach, one-sentence diagnoses, pick next week's 4 ideas" },
];

export const POSTING_MAP: { day: string; tiktok: string; instagram: string; youtube: string }[] = [
  // Cadence is provisional — TBD until Samy picks a posting rhythm. Same cut
  // ships to all three platforms (60–90s works everywhere in 2026).
  { day: "Tue", tiktok: "Concept", instagram: "same Reel", youtube: "same + Short" },
  { day: "Thu", tiktok: "Gotcha", instagram: "same Reel", youtube: "same + Short" },
  { day: "Sat", tiktok: "Concept / Built-It", instagram: "same Reel", youtube: "same + Short" },
];

export const QUALITY_BAR: string[] = [
  "First frame: motion + text visible, works on mute",
  "Keyword spoken in first 3s (TikTok SEO)",
  "No dead air > 0.5s",
  "Captions never cover the code being discussed",
  "Numbers shown on screen, not just spoken",
  "✗ marker used if a failure is shown",
  "End: CTA matches pillar (save / send / follow-for-next-episode)",
  "Audio: no clipping, enhanced, consistent loudness across the batch",
];

export const NON_NEGOTIABLES: string[] = [
  "Every post passes the send test: would a dev DM this to a friend?",
  "Every video teaches one concept that stands on its own, without needing my projects to make sense",
  "Hooks never name-drop tools or model versions — those go in captions",
  "Ship before ready: the first 10 posts are calibration data, not reputation",
];

export const KILL_SCALE_RULES: string[] = [
  "Hook scoring: log 3s retention against the hook formula; after 12 posts, retire the bottom formula",
  "Scale: any post >2x rolling median sends/reach → v2 within a month + 2 sibling ideas to the bank",
  "Kill: any format underperforming median across 4 attempts → drop the format, not the topic",
  "Series check: learning-path follows-per-post down 3 episodes straight → restructure before abandoning",
  "Bank rule: never let unscripted ideas drop below 12",
];

type SeedIdea = Pick<ContentIdea, "title" | "pillar" | "hookFormula" | "episode">;

// episode = position in the learning path (continuity: each concept teases the
// next). Concept explainers carry the spine; Built-It proofs and Gotchas
// interleave for rhythm. Helpers name the NEW meaning; keys stay legacy.
const CN = (episode: number, hookFormula: number, title: string): SeedIdea => ({
  title, pillar: "under-the-hood", hookFormula, episode, // Concept
});
const BI = (episode: number, hookFormula: number, title: string): SeedIdea => ({
  title, pillar: "build-log", hookFormula, episode, // Built It
});
const GT = (episode: number, hookFormula: number, title: string): SeedIdea => ({
  title, pillar: "workflow-win", hookFormula, episode, // Gotcha
});

// The learning path — "AI, from a few steps ahead." One ordered series;
// episode numbers give continuity. Reframed from the old homelab-diary bank
// (2026-07-18). Peer voice, concept-first, grounded in real builds.
export const SEED_IDEAS: SeedIdea[] = [
  CN(1, 7, "What an AI agent actually is — brain, tools, loop, in 90 seconds."),
  CN(2, 7, "How an agent knows when it's actually *done* (it's not vibes — it's eval)."),
  BI(3, 9, "I don't grade my AI on vibes — 10 checks that run against it every 30 minutes."),
  CN(4, 7, "What a token actually is — and why your AI bill randomly spikes."),
  CN(5, 2, "What a context window really is — and why pasting your whole repo backfires."),
  GT(6, 2, "\"Just add more context\" made my AI worse. Here's what actually fixed it."),
  CN(7, 7, "RAG, explained by someone who just learned it — and when you DON'T need it."),
  CN(8, 7, "Embeddings: how \"similar meaning\" turns into math the model can search."),
  BI(9, 10, "Your AI has no memory. Here's how I fake it with a plain text file — no vector DB."),
  CN(10, 7, "Tool use / function calling — how a model actually *does* things, not just talks."),
  CN(11, 7, "Prompt anatomy: role, context, task, format, escape hatch — the labeled diagram."),
  CN(12, 7, "Structured output: why JSON mode beats \"please format it nicely.\""),
  CN(13, 7, "MCP explained — the USB-C port that lets any AI plug into your tools."),
  BI(14, 9, "I built an agent that runs my homelab while I sleep — the 60-line loop, shown."),
  GT(15, 11, "My agents ran for DAYS producing nothing — zero errors. The one-line fix."),
  CN(16, 2, "When NOT to fine-tune — the call most beginners get backwards."),
  GT(17, 7, "The 5 ways AI code quietly lies to you (hallucinated APIs, faked tests, and more)."),
];

// Static playbook data for the Content OS section. Source of truth is the
// Obsidian vault (01-Inbox/content-os/); this mirrors the parts the app
// needs to render and seed. If the vault docs change materially, update here.
import type { ContentPillar, ContentIdea } from "./types";

export const PILLARS: {
  pillar: ContentPillar;
  label: string;
  short: string;
  job: string;
  cadence: string;
  color: string;
}[] = [
  {
    pillar: "build-log",
    label: "Build Log",
    short: "BL",
    job: "Retention + community — episodic build-in-public, serial follows",
    cadence: "2 videos/week (Tue + Sat)",
    color: "#7C9E8A",
  },
  {
    pillar: "workflow-win",
    label: "Workflow Win",
    short: "WW",
    job: "Discovery — cold-audience 15–30s quick wins, highest hook standard",
    cadence: "1 video/week (Thu)",
    color: "#6366F1",
  },
  {
    pillar: "under-the-hood",
    label: "Under the Hood",
    short: "UH",
    job: "Saves + sends — carousel authority engine",
    cadence: "1 carousel/week (Fri IG, Sun TikTok photo mode)",
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
  { n: 4, name: "Build Log open", template: "Build Log ___: [today's tension]" },
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
  { day: "Mon", block: "Script", time: "1.5h", what: "Write 4 scripts (2 BL, 1 WW, 1 carousel), assign hook formulas, read aloud, cut 15%, write captions now" },
  { day: "Tue", block: "Record", time: "1.5h", what: "All voiceovers in one sitting (stand up, 2 takes each), then screen captures; carousel into Figma template (30 min cap)" },
  { day: "Wed", block: "Edit", time: "2.5h", what: "~40 min/video in the CapCut master template. Kill-rule: fighting past 50 min → ship rough or drop" },
  { day: "Tue–Sun", block: "Publish", time: "1h total", what: "4 posts from last week's batch, per the posting map" },
  { day: "Daily", block: "Engage", time: "15–20 min", what: "Reply to every comment; comment on 5 niche accounts (add information, not applause)" },
  { day: "Fri", block: "Review", time: "20 min", what: "Log metrics, best/worst by sends per reach, one-sentence diagnoses, pick next week's 4 ideas" },
];

export const POSTING_MAP: { day: string; tiktok: string; instagram: string; youtube: string }[] = [
  { day: "Tue", tiktok: "Build Log ep.", instagram: "same Reel", youtube: "same" },
  { day: "Thu", tiktok: "Workflow Win", instagram: "same Reel", youtube: "same" },
  { day: "Fri", tiktok: "—", instagram: "Carousel", youtube: "—" },
  { day: "Sat", tiktok: "Build Log ep.", instagram: "same Reel", youtube: "same" },
  { day: "Sun", tiktok: "Carousel → photo mode", instagram: "—", youtube: "—" },
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
  "Every Build Log episode teaches a lesson that works without the product",
  "Hooks never name-drop tools or model versions — those go in captions",
  "Ship before ready: the first 10 posts are calibration data, not reputation",
];

export const KILL_SCALE_RULES: string[] = [
  "Hook scoring: log 3s retention against the hook formula; after 12 posts, retire the bottom formula",
  "Scale: any post >2x rolling median sends/reach → v2 within a month + 2 sibling ideas to the bank",
  "Kill: any format underperforming median across 4 attempts → drop the format, not the topic",
  "Series check: Build Log follows-per-post down 3 episodes straight → restructure before abandoning",
  "Bank rule: never let unscripted ideas drop below 12",
];

type SeedIdea = Pick<ContentIdea, "title" | "pillar" | "hookFormula" | "episode">;

const BL = (episode: number, hookFormula: number, title: string): SeedIdea => ({
  title, pillar: "build-log", hookFormula, episode,
});
const WW = (hookFormula: number, title: string): SeedIdea => ({
  title, pillar: "workflow-win", hookFormula,
});
const UH = (hookFormula: number, title: string): SeedIdea => ({
  title, pillar: "under-the-hood", hookFormula,
});

// The 60 starter ideas from 07-idea-bank.md, in vault order.
export const SEED_IDEAS: SeedIdea[] = [
  BL(1, 4, "The premise: plain English in, working automation out. AI is the whole eng team."),
  BL(2, 4, "First parser attempt; AI invents an API that doesn't exist."),
  BL(3, 11, "Letting the agent run unsupervised: the $3 infinite loop."),
  BL(4, 10, "The \"definition of done\" rule that fixed agent looping."),
  BL(5, 4, "First end-to-end automation runs. Show it, warts included."),
  BL(6, 5, "I rebuilt a feature 3 times because my spec was vague, not the AI."),
  BL(7, 2, "\"Just add more context\" made output worse. What fixed it."),
  BL(8, 4, "Designing the visual workflow view; AI as UI pair-designer."),
  BL(9, 11, "AI writes my tests; I audit them. The one it faked."),
  BL(10, 5, "Token bill review: what building this actually costs."),
  BL(11, 4, "First stranger tries it. Watching them break it in 90 seconds."),
  BL(12, 10, "The error-message rewrite that fixed onboarding."),
  BL(13, 2, "I stopped asking AI to \"build the feature\" and started asking for a plan first."),
  BL(14, 4, "Handling ambiguity: what \"email the team when it fails\" should even mean."),
  BL(15, 5, "The refactor I postponed for a month took AI + me one evening."),
  BL(16, 8, "Month review: AI-as-eng-team verdict, with numbers."),
  BL(17, 11, "Security pass: what the AI missed that a human wouldn't."),
  BL(18, 4, "Building the integrations layer; webhooks in plain English."),
  BL(19, 10, "My prompt file is now my most valuable code asset. Here's its structure."),
  BL(20, 4, "What I'd tell myself at Build Log 01."),
  WW(1, "Build a form→Slack automation instead of paying for one."),
  WW(3, "Characterization tests first, then refactor: the 40-min→4-min pattern."),
  WW(10, "Make AI ask 3 questions before writing code."),
  WW(6, "Still writing regex by hand? Describe → generate → test in one flow."),
  WW(9, "Cold open: full CRUD scaffold appearing. Then the prompt."),
  WW(1, "Cron jobs in plain English: schedule anything without reading man pages."),
  WW(3, "API integration: paste the docs page, get the client + error handling."),
  WW(10, "The \"review the diff, not the code\" rule for AI changes."),
  WW(6, "Manual git commit messages → AI messages from the diff, enforced format."),
  WW(2, "\"Let AI write the whole file\" is wrong — function-level beats file-level."),
  WW(9, "Cold open: a scraper assembling itself. Legal + rate-limit guardrails included."),
  WW(1, "Your own link-in-bio page in 15 minutes, hosting free."),
  WW(3, "Debugging: paste stack trace + failing test, not just the error."),
  WW(10, "One prompt rule for SQL: schema first, question second."),
  WW(6, "Still reading 500-line PRs raw? AI pre-review checklist workflow."),
  WW(8, "I made AI write all my docs for a week. Verdict."),
  WW(1, "Personal dashboard from 3 APIs in one evening, $0."),
  WW(3, "Env setup for a new machine: one AI-generated script."),
  WW(10, "The \"explain it back to me\" trick that catches AI misunderstanding early."),
  WW(2, "Everyone prompts for code. Prompt for the test cases first."),
  UH(7, "RAG anatomy in 9 slides — what it is, when you actually need it."),
  UH(7, "What a context window really is (and why pasting your repo backfires)."),
  UH(2, "\"Agents\" demystified: it's a loop with tools. The whole diagram."),
  UH(7, "How my automation engine parses English → workflow steps (real architecture)."),
  UH(7, "Tokens, cost, and why your AI bill spikes: the mental model."),
  UH(2, "Fine-tuning is almost never the answer. The decision tree."),
  UH(7, "Webhooks explained for automation builders — the postman metaphor, done right."),
  UH(7, "Local vs API models for builders: the honest tradeoff table."),
  UH(2, "\"More agents = better\" is wrong. When multi-agent helps and when it thrashes."),
  UH(7, "Prompt anatomy: role, context, task, format, escape hatch — labeled diagram."),
  UH(7, "Embeddings in 8 slides: how \"similar meaning\" becomes math."),
  UH(2, "Your AI doesn't remember you. Sessions, memory, and state — the diagram."),
  UH(7, "The 5 failure modes of AI code (hallucinated APIs, stale patterns, silent edge cases, fake tests, security naïveté)."),
  UH(7, "What happens between hitting Enter and getting a response — the full round trip."),
  UH(7, "Structured output: why JSON mode beats \"please format nicely\"."),
  UH(2, "Bigger model ≠ better results: the task-fit matrix."),
  UH(7, "Rate limits, retries, backoff — the automation reliability trio."),
  UH(7, "Eval basics for builders: how to know your prompt got worse."),
  UH(7, "The anatomy of a good bug report to an AI (works on humans too)."),
  UH(2, "\"AI will replace devs\" — the argument, dismantled with what it actually shifts."),
];

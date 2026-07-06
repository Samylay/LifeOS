// Server-side only — generate structured plans via the Claude Code CLI in
// headless mode (`claude -p`), using the subscription auth mounted at
// CLAUDE_CONFIG_DIR (~/.claude). No ANTHROPIC_API_KEY / per-token bill.
//
// Mirrors Flux's claude-cli backend. Falls back is the caller's concern; this
// module throws if the CLI isn't available or returns unparseable output.
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

const CLAUDE_CLI_PATH = process.env.CLAUDE_CLI_PATH ?? "claude";
const CLAUDE_CLI_MODEL = process.env.CLAUDE_CLI_MODEL ?? "sonnet";
const CLAUDE_CLI_TIMEOUT = Number(process.env.CLAUDE_CLI_TIMEOUT ?? 180_000);

export function claudeCliEnabled(): boolean {
  return (process.env.GEN_PROVIDER ?? "") === "claude-cli";
}

/** Run one `claude -p` query and return the assistant's text output. */
async function runClaude(prompt: string): Promise<string> {
  const { stdout } = await execFileP(
    CLAUDE_CLI_PATH,
    ["-p", prompt, "--model", CLAUDE_CLI_MODEL, "--output-format", "json"],
    { timeout: CLAUDE_CLI_TIMEOUT, maxBuffer: 10 * 1024 * 1024 }
  );
  // `--output-format json` wraps the run in an envelope: { result, ... }.
  try {
    const env = JSON.parse(stdout);
    return typeof env.result === "string" ? env.result : stdout;
  } catch {
    return stdout;
  }
}

/** Pull the first JSON object/array out of a model response. */
function extractJson<T>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.search(/[[{]/);
  if (start === -1) throw new Error("no JSON in model output");
  const slice = candidate.slice(start);
  return JSON.parse(slice) as T;
}

/** Run one `claude -p` query and return the raw assistant text. */
export async function generateText(prompt: string): Promise<string> {
  return runClaude(prompt);
}

/**
 * Run one `claude -p` query and parse a single JSON value out of the response.
 * The prompt should instruct Claude to reply with JSON only; this tolerates
 * stray prose or ```json fences around it.
 */
export async function generateJson<T>(prompt: string): Promise<T> {
  const text = await runClaude(prompt);
  return extractJson<T>(text);
}

export interface GoalDraft {
  outcome: string; // refined definition of done
  milestones: string[]; // ~quarter-level steps
  thisWeek: string[]; // 1-3 commitments for the current week
}

/** Ask Claude to break a quarterly objective into milestones + this week. */
export async function draftGoalPlan(input: {
  title: string;
  quarter: string;
  why?: string;
  outcome?: string;
}): Promise<GoalDraft> {
  const prompt = [
    "You are a pragmatic planning coach. Break a quarterly objective into a",
    "practical plan. Respond with ONLY a JSON object, no prose, of the shape:",
    `{"outcome": string, "milestones": string[], "thisWeek": string[]}`,
    "- outcome: a crisp one-sentence definition of done for the quarter.",
    "- milestones: 4-8 sequential steps spanning the quarter.",
    "- thisWeek: 1-3 concrete, doable actions to take THIS week (start with a verb).",
    "",
    `Objective: ${input.title}`,
    `Quarter: ${input.quarter}`,
    input.why ? `Why it matters: ${input.why}` : "",
    input.outcome ? `Desired outcome (refine if vague): ${input.outcome}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const text = await runClaude(prompt);
  const draft = extractJson<Partial<GoalDraft>>(text);
  return {
    outcome: draft.outcome ?? input.outcome ?? "",
    milestones: Array.isArray(draft.milestones) ? draft.milestones.slice(0, 8) : [],
    thisWeek: Array.isArray(draft.thisWeek) ? draft.thisWeek.slice(0, 3) : [],
  };
}

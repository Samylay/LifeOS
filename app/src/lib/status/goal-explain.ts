import { readFileSync } from "node:fs";
import path from "node:path";

const GOALS_DIR = process.env.GOALS_DIR || "/home/quorky/infra/goals/goals";

/** What a standing goal is saying when it fails, in one sentence, from the goal's own file:
 *  the first sentence of its `on-violation:` line, after the leading "alert." marker. */
export function whatFailed(fileText: string): string | null {
  const line = fileText.split("\n").find((l) => l.startsWith("on-violation:"));
  if (!line) return null;
  let text = line.slice("on-violation:".length).trim().replace(/^(alert|page|info)\.\s*/i, "");
  text = text.replace(/`/g, "");
  const first = text.split(/(?<=[.!?])\s+/)[0] ?? "";
  if (!first) return null;
  return first.length > 160 ? `${first.slice(0, first.lastIndexOf(" ", 157))}…` : first;
}

/** Plain name for a goal slug: "autoloop-no-silent-demotion" becomes "Autoloop no silent demotion". */
export function goalLabel(slug: string): string {
  const words = slug.replace(/[-_]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Read a goal's explanation. Only plain slugs are accepted, so a metric label cannot name a path. */
export function explainGoal(slug: string, dir = GOALS_DIR): string | null {
  if (!/^[a-z0-9][a-z0-9-]{0,80}$/.test(slug)) return null;
  try {
    return whatFailed(readFileSync(path.join(dir, `${slug}.md`), "utf8"));
  } catch {
    return null;
  }
}

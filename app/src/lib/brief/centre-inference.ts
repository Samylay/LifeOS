// Infers which of the nine daily-planning centres a Todoist task belongs to,
// from its title/content — see ~/loop-me/workflows/daily-planning.md
// "Todoist integration". Todoist has no per-centre projects/labels today, so
// this is a lightweight keyword match rather than a manual tagging pass.
import path from "node:path";
import fs from "node:fs";

export const CENTRES = [
  "lifeos",
  "flux",
  "ecole",
  "scout",
  "reels-reader",
  "homelab-infra",
  "workouts",
  "polymath",
  "swe-learning",
] as const;

export type Centre = (typeof CENTRES)[number];

export interface CentreInference {
  centre: Centre | null;
  confidence: "high" | "low";
}

// Keyword lists per centre. Matching is case-insensitive substring search
// over "title description". A task matching exactly one centre's keywords is
// "high" confidence; matching zero or more than one is "low" (ambiguous —
// surface it for Samy to categorize rather than guess).
const KEYWORDS: Record<Centre, string[]> = {
  lifeos: ["lifeos"],
  flux: ["flux"],
  ecole: ["ecole", "layaida"],
  scout: ["scout"],
  "reels-reader": ["reels-reader", "reels reader"],
  "homelab-infra": ["homelab", "infra", "server", "vps", "n8n", "docker", "systemd", "tailscale"],
  workouts: ["workout", "run", "gym", "strength", "training", "ironman", "swim", "bike"],
  polymath: ["polymath", "read", "book", "article", "learn"],
  "swe-learning": ["swe", "leetcode", "algorithm", "typescript", "coding exercise"],
};

// Word-boundary match so e.g. polymath's "read" keyword doesn't fire inside
// "reels-reader".
function hasKeyword(haystack: string, keyword: string): boolean {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`).test(haystack);
}

export function inferCentre(task: { content: string; description?: string }): CentreInference {
  const haystack = `${task.content} ${task.description ?? ""}`.toLowerCase();
  const matched = CENTRES.filter((centre) =>
    KEYWORDS[centre].some((kw) => hasKeyword(haystack, kw))
  );
  if (matched.length === 1) return { centre: matched[0], confidence: "high" };
  return { centre: null, confidence: "low" };
}

interface CacheEntry {
  content: string;
  centre: Centre | null;
  confidence: "high" | "low";
}

function dataDir(): string {
  const dbPath = process.env.LIFEOS_DB_PATH || path.join(process.cwd(), "data", "lifeos.db");
  const dir = path.dirname(dbPath);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function cacheFile(): string {
  return path.join(dataDir(), "todoist-centre-cache.json");
}

function readCache(): Record<string, CacheEntry> {
  try {
    return JSON.parse(fs.readFileSync(cacheFile(), "utf8"));
  } catch {
    return {};
  }
}

function writeCache(cache: Record<string, CacheEntry>): void {
  fs.writeFileSync(cacheFile(), JSON.stringify(cache, null, 2));
}

/**
 * Infers a centre for each task, reusing a cached inference (keyed by task
 * id) when the task's content hasn't changed since it was last inferred, so
 * the same task isn't re-inferred every day.
 */
export function inferCentresCached(
  tasks: { id: string; content: string; description?: string }[]
): (CentreInference & { id: string })[] {
  const cache = readCache();
  let dirty = false;

  const results = tasks.map((task) => {
    const cached = cache[task.id];
    if (cached && cached.content === task.content) {
      return { id: task.id, centre: cached.centre, confidence: cached.confidence };
    }
    const inference = inferCentre(task);
    cache[task.id] = { content: task.content, ...inference };
    dirty = true;
    return { id: task.id, ...inference };
  });

  if (dirty) writeCache(cache);
  return results;
}

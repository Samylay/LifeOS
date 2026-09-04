// T-projects-rework-02 — gathering what a repo knows about itself.
//
// This is the I/O half of the split: it reads the filesystem and git, and
// hands raw signals to the pure judgement in state.ts. Nothing here decides
// what a project's status means, and nothing in state.ts touches a disk.
//
// It never writes. The autoloop and Samy write ROADMAPs; this surface reads.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { parseRoadmap, type ParsedRoadmap } from "@/lib/brief/roadmap-parser";
import { deriveProjectState, type ProjectSignals, type ProjectState } from "./state";

const HOME = "/home/quorky";

// Projects exist because repos exist — there is no curated list to maintain,
// which is the whole point of the rework. ~/apps holds one repo per project;
// ~/infra is a single repo of its own (the homelab).
export const DEFAULT_ROOTS = {
  appsDir: path.join(HOME, "apps"),
  infraDir: path.join(HOME, "infra"),
};

export interface ProjectSource {
  name: string;
  dir: string;
}

export interface ProjectEntry {
  name: string;
  dir: string;
  // null when the repo could not be read — the entry stays in the list with
  // its error, because silently dropping a project reproduces exactly the
  // failure this rework is about: a surface that looks true and isn't.
  state: ProjectState | null;
  lastCommitAt: string | null;
  lastCommitSubject: string | null;
  // Last commit the nightly autoloop made here, so unattended work is visible.
  autoloopTouchedAt: string | null;
  openTaskCount: number;
  error: string | null;
}

export function listProjectSources(roots = DEFAULT_ROOTS): ProjectSource[] {
  const out: ProjectSource[] = [];
  try {
    for (const name of fs.readdirSync(roots.appsDir).sort()) {
      const dir = path.join(roots.appsDir, name);
      if (fs.existsSync(path.join(dir, ".git"))) out.push({ name, dir });
    }
  } catch {
    // No ~/apps mounted (a test box, a misconfigured container). Callers see
    // an empty list rather than a crash; the surface will say it found none.
  }
  if (fs.existsSync(path.join(roots.infraDir, ".git"))) {
    out.push({ name: "homelab-infra", dir: roots.infraDir });
  }
  return out;
}

function git(dir: string, args: string[]): string {
  // `-c safe.directory=<dir>` scoped to the repo being read, not a global
  // trust-everything. The container runs as root while the repos are owned by
  // the host user (uid 1000), which git refuses as dubious ownership — and it
  // is right to, so the exception stays narrow and per-invocation rather than
  // living in the image or a global config.
  return execFileSync("git", ["-c", `safe.directory=${dir}`, "-C", dir, ...args], {
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "ignore"],
    timeout: 5000,
  }).trim();
}

// ~/infra keeps a ROADMAP.md per area rather than one at its root, so reading
// only the root would report the homelab as having no open work while several
// areas do. Walk one level deep and merge — the same shape tracked-centres.ts
// already uses for ~/infra, so the two agree on where infra work lives.
function readRoadmap(dir: string): ParsedRoadmap | null {
  const rootPath = path.join(dir, "ROADMAP.md");
  if (fs.existsSync(rootPath)) return parseRoadmap(fs.readFileSync(rootPath, "utf-8"));

  const merged: ParsedRoadmap = { needsUserTasks: [], nextTask: null };
  let found = false;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const nested = path.join(dir, entry.name, "ROADMAP.md");
    if (!fs.existsSync(nested)) continue;
    found = true;
    const parsed = parseRoadmap(fs.readFileSync(nested, "utf-8"));
    merged.needsUserTasks.push(...parsed.needsUserTasks);
    // First unchecked task in directory order wins, matching the rule the
    // nightly executor follows within a single file.
    if (!merged.nextTask && parsed.nextTask) merged.nextTask = parsed.nextTask;
  }
  return found ? merged : null;
}

function isReadableRepo(dir: string): boolean {
  try {
    return git(dir, ["rev-parse", "--is-inside-work-tree"]) === "true";
  } catch {
    return false;
  }
}

export function gatherSignals(
  source: ProjectSource,
  archivedNames: ReadonlySet<string>,
  now: Date,
): ProjectEntry {
  const base: Omit<ProjectEntry, "state" | "error"> = {
    name: source.name,
    dir: source.dir,
    lastCommitAt: null,
    lastCommitSubject: null,
    autoloopTouchedAt: null,
    openTaskCount: 0,
  };

  let lastCommitAt: Date | null = null;
  try {
    const line = git(source.dir, ["log", "-1", "--format=%cI%x00%s"]);
    const [iso, subject] = line.split("\0");
    if (iso) {
      const parsed = new Date(iso);
      if (!Number.isNaN(parsed.getTime())) {
        lastCommitAt = parsed;
        base.lastCommitAt = parsed.toISOString();
        base.lastCommitSubject = subject ?? null;
      }
    }
  } catch (e) {
    // `git log` also fails on a perfectly good repo that has never been
    // committed to. That is "has not started", not "is broken", so check
    // whether the repo itself is readable before calling it an error.
    if (!isReadableRepo(source.dir)) {
      return {
        ...base,
        state: null,
        error: e instanceof Error
          ? `could not read git history: ${e.message}`
          : "could not read git history",
      };
    }
    // Readable and empty: fall through with lastCommitAt still null, which
    // state.ts judges as stalled.
  }

  try {
    // The autoloop prefixes its unattended commits; that convention is what
    // makes its work visible here without a second source of truth.
    const iso = git(source.dir, ["log", "-1", "--format=%cI", "--grep=^autoloop:"]);
    if (iso) base.autoloopTouchedAt = new Date(iso).toISOString();
  } catch {
    // Not fatal — the project still has a status without this.
  }

  let roadmap = null;
  try {
    roadmap = readRoadmap(source.dir);
    if (roadmap) {
      base.openTaskCount = roadmap.needsUserTasks.length + (roadmap.nextTask ? 1 : 0);
    }
  } catch (e) {
    return {
      ...base,
      state: null,
      error: e instanceof Error ? `could not read ROADMAP.md: ${e.message}` : "could not read ROADMAP.md",
    };
  }

  const signals: ProjectSignals = {
    name: source.name,
    lastCommitAt,
    roadmap,
    archived: archivedNames.has(source.name),
    // Completion is derived from the ROADMAP having nothing open, never
    // typed in — see state.ts.
    completed: false,
  };

  return { ...base, state: deriveProjectState(signals, now), error: null };
}

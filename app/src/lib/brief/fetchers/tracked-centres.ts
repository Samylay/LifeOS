// Aggregator for the "tracked" daily-planning centres — see
// ~/loop-me/workflows/daily-planning.md "Tracked-centre aggregator" section.
//
// LifeOS/Flux/Ecole/Scout/reels-reader each get their ROADMAP.md's open
// NEEDS-SAMY items plus the next unchecked non-NEEDS-SAMY task (the same
// "first unchecked task" rule the nightly executor itself follows).
// homelab-infra is different: a currently-failing standing goal
// (~/infra/goals/state/<name>.status == FAIL) always outranks everything
// else, so only violations are reported when any exist; otherwise it falls
// back to the first NEEDS-SAMY task found across ~/infra/*/ROADMAP.md.
//
// Not wired into the brief builder/registry yet (same as T21's
// todoist-centres.ts) — a later checkpoint task consumes this output.
import fs from "node:fs";
import path from "node:path";
import { parseRoadmap } from "../roadmap-parser";

export type Urgency = "violation" | "needs-samy" | "next-task";

export interface CentreItem {
  centre: string;
  title: string;
  urgency: Urgency;
}

export interface TrackedProject {
  centre: string;
  roadmapPath: string;
}

export interface InfraPaths {
  goalsDir: string; // ~/infra/goals — contains goals/*.md + state/*.status
  infraDir: string; // ~/infra — walked one level deep for */ROADMAP.md
}

const HOME = "/home/quorky";

export const DEFAULT_PROJECTS: TrackedProject[] = [
  { centre: "LifeOS", roadmapPath: path.join(HOME, "apps/lifeos/ROADMAP.md") },
  { centre: "Flux", roadmapPath: path.join(HOME, "apps/flux/ROADMAP.md") },
  { centre: "Ecole", roadmapPath: path.join(HOME, "apps/Ecole/ROADMAP.md") },
  { centre: "Scout", roadmapPath: path.join(HOME, "apps/scout/ROADMAP.md") },
  { centre: "reels-reader", roadmapPath: path.join(HOME, "apps/reels-reader/ROADMAP.md") },
];

export const DEFAULT_INFRA_PATHS: InfraPaths = {
  goalsDir: path.join(HOME, "infra/goals"),
  infraDir: path.join(HOME, "infra"),
};

function readFile(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

function roadmapItems(centre: string, roadmapPath: string): CentreItem[] {
  const contents = readFile(roadmapPath);
  if (contents === null) return [];

  const parsed = parseRoadmap(contents);
  const items: CentreItem[] = parsed.needsSamyTasks.map((t) => ({
    centre,
    title: t.title,
    urgency: "needs-samy" as const,
  }));
  if (parsed.nextTask) {
    items.push({ centre, title: parsed.nextTask.title, urgency: "next-task" });
  }
  return items;
}

export function trackedCentreItems(projects: TrackedProject[] = DEFAULT_PROJECTS): CentreItem[] {
  return projects.flatMap((p) => roadmapItems(p.centre, p.roadmapPath));
}

function goalViolations(goalsDir: string): CentreItem[] {
  const goalsSubdir = path.join(goalsDir, "goals");
  const stateSubdir = path.join(goalsDir, "state");

  let files: string[];
  try {
    files = fs.readdirSync(goalsSubdir).filter((f) => f.endsWith(".md"));
  } catch {
    return [];
  }

  const violations: CentreItem[] = [];
  for (const file of files) {
    const contents = readFile(path.join(goalsSubdir, file));
    if (contents === null || /^retired:\s*true/m.test(contents)) continue;

    const name = file.replace(/\.md$/, "");
    const status = readFile(path.join(stateSubdir, `${name}.status`))?.trim();
    if (status === "FAIL") {
      violations.push({ centre: "homelab-infra", title: `standing goal violated: ${name}`, urgency: "violation" });
    }
  }
  return violations;
}

function discoverInfraRoadmaps(infraDir: string): string[] {
  let dirents: fs.Dirent[];
  try {
    dirents = fs.readdirSync(infraDir, { withFileTypes: true });
  } catch {
    return [];
  }
  return dirents
    .filter((d) => d.isDirectory())
    .map((d) => path.join(infraDir, d.name, "ROADMAP.md"))
    .filter((p) => fs.existsSync(p));
}

function nextInfraNeedsSamy(infraDir: string): CentreItem | null {
  for (const roadmapPath of discoverInfraRoadmaps(infraDir)) {
    const contents = readFile(roadmapPath);
    if (contents === null) continue;
    const parsed = parseRoadmap(contents);
    if (parsed.needsSamyTasks.length > 0) {
      return { centre: "homelab-infra", title: parsed.needsSamyTasks[0].title, urgency: "needs-samy" };
    }
  }
  return null;
}

export function homelabInfraItems(paths: InfraPaths = DEFAULT_INFRA_PATHS): CentreItem[] {
  const violations = goalViolations(paths.goalsDir);
  if (violations.length > 0) return violations;

  const nextSamy = nextInfraNeedsSamy(paths.infraDir);
  return nextSamy ? [nextSamy] : [];
}

export function aggregateTrackedCentres(opts?: {
  projects?: TrackedProject[];
  infra?: InfraPaths;
}): CentreItem[] {
  return [...trackedCentreItems(opts?.projects), ...homelabInfraItems(opts?.infra)];
}

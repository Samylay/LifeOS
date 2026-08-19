// Pure parser for the `- [ ] **T01 — Title** (...)` task-line convention used
// by every ROADMAP.md across ~/apps and ~/infra (see this repo's own
// ROADMAP.md for the canonical shape). No filesystem access here — callers
// read the file and hand this the raw contents, which keeps it unit-testable
// against fixture strings.

export interface RoadmapTask {
  title: string;
  needsUser: boolean;
}

export interface ParsedRoadmap {
  needsUserTasks: RoadmapTask[];
  // First unchecked task whose title doesn't contain NEEDS-USER, in file
  // order — same "first match wins" rule the nightly executor itself uses.
  nextTask: RoadmapTask | null;
}

const TASK_LINE = /^-\s\[( |x)\]\s+(?:~~)?\*\*([^*]+)\*\*/;

export function parseRoadmap(contents: string): ParsedRoadmap {
  const needsUserTasks: RoadmapTask[] = [];
  let nextTask: RoadmapTask | null = null;

  for (const line of contents.split("\n")) {
    const match = line.match(TASK_LINE);
    if (!match) continue;
    const checked = match[1] === "x";
    if (checked) continue;

    const title = match[2].trim();
    const needsUser = title.includes("NEEDS-USER");

    if (needsUser) {
      needsUserTasks.push({ title, needsUser: true });
    } else if (!nextTask) {
      nextTask = { title, needsUser: false };
    }
  }

  return { needsUserTasks, nextTask };
}

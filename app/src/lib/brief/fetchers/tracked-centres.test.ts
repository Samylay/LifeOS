import { describe, it, expect, beforeEach, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import {
  trackedCentreItems,
  homelabInfraItems,
  aggregateTrackedCentres,
  type TrackedProject,
  type InfraPaths,
} from "./tracked-centres";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lifeos-tracked-centres-test-"));
let caseDir: string;

beforeEach(() => {
  caseDir = fs.mkdtempSync(path.join(tmpDir, "case-"));
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeRoadmap(name: string, contents: string): string {
  const p = path.join(caseDir, name);
  fs.writeFileSync(p, contents);
  return p;
}

describe("trackedCentreItems", () => {
  it("emits needs-samy items plus the next task per project, and skips missing files", () => {
    const flux = writeRoadmap(
      "flux.md",
      `
- [x] **T01 — Done** (S) — done.
- [ ] **T02 — NEEDS-SAMY: pick a name** (S) — asks something.
- [ ] **T03 — Ship it** (M) — next up.
`
    );
    const projects: TrackedProject[] = [
      { centre: "Flux", roadmapPath: flux },
      { centre: "Ghost", roadmapPath: path.join(caseDir, "does-not-exist.md") },
    ];

    expect(trackedCentreItems(projects)).toEqual([
      { centre: "Flux", title: "T02 — NEEDS-SAMY: pick a name", urgency: "needs-samy" },
      { centre: "Flux", title: "T03 — Ship it", urgency: "next-task" },
    ]);
  });
});

describe("homelabInfraItems", () => {
  it("prioritizes a failing standing goal over any NEEDS-SAMY infra task", () => {
    const goalsDir = path.join(caseDir, "goals");
    fs.mkdirSync(path.join(goalsDir, "goals"), { recursive: true });
    fs.mkdirSync(path.join(goalsDir, "state"), { recursive: true });
    fs.writeFileSync(path.join(goalsDir, "goals", "backup-fresh.md"), "predicate: true\n");
    fs.writeFileSync(path.join(goalsDir, "state", "backup-fresh.status"), "FAIL\n");

    const infraDir = path.join(caseDir, "infra");
    fs.mkdirSync(path.join(infraDir, "n8n"), { recursive: true });
    fs.writeFileSync(
      path.join(infraDir, "n8n", "ROADMAP.md"),
      "- [ ] **T01 — NEEDS-SAMY: rotate a key** (S) — decide.\n"
    );

    const paths: InfraPaths = { goalsDir, infraDir };
    expect(homelabInfraItems(paths)).toEqual([
      { centre: "homelab-infra", title: "standing goal violated: backup-fresh", urgency: "violation" },
    ]);
  });

  it("skips retired goals and falls back to the first NEEDS-SAMY infra task when nothing is failing", () => {
    const goalsDir = path.join(caseDir, "goals");
    fs.mkdirSync(path.join(goalsDir, "goals"), { recursive: true });
    fs.mkdirSync(path.join(goalsDir, "state"), { recursive: true });
    fs.writeFileSync(
      path.join(goalsDir, "goals", "old-goal.md"),
      "predicate: true\nretired: true\n"
    );
    fs.writeFileSync(path.join(goalsDir, "state", "old-goal.status"), "FAIL\n");
    fs.writeFileSync(path.join(goalsDir, "goals", "passing.md"), "predicate: true\n");
    fs.writeFileSync(path.join(goalsDir, "state", "passing.status"), "pass\n");

    const infraDir = path.join(caseDir, "infra");
    fs.mkdirSync(path.join(infraDir, "backup"), { recursive: true });
    fs.mkdirSync(path.join(infraDir, "monitoring"), { recursive: true });
    fs.writeFileSync(path.join(infraDir, "backup", "ROADMAP.md"), "- [ ] **T01 — Plain task** (S) — nothing to decide.\n");
    fs.writeFileSync(
      path.join(infraDir, "monitoring", "ROADMAP.md"),
      "- [ ] **T01 — NEEDS-SAMY: alert threshold** (S) — decide.\n"
    );

    const paths: InfraPaths = { goalsDir, infraDir };
    expect(homelabInfraItems(paths)).toEqual([
      { centre: "homelab-infra", title: "T01 — NEEDS-SAMY: alert threshold", urgency: "needs-samy" },
    ]);
  });

  it("returns an empty list when nothing is failing and no infra task needs Samy", () => {
    const goalsDir = path.join(caseDir, "goals");
    fs.mkdirSync(path.join(goalsDir, "goals"), { recursive: true });
    fs.mkdirSync(path.join(goalsDir, "state"), { recursive: true });

    const infraDir = path.join(caseDir, "infra");
    fs.mkdirSync(infraDir, { recursive: true });

    expect(homelabInfraItems({ goalsDir, infraDir })).toEqual([]);
  });
});

describe("aggregateTrackedCentres", () => {
  it("concatenates project items and homelab-infra items", () => {
    const flux = writeRoadmap("flux.md", "- [ ] **T01 — Ship it** (S) — go.\n");
    const goalsDir = path.join(caseDir, "goals");
    fs.mkdirSync(path.join(goalsDir, "goals"), { recursive: true });
    fs.mkdirSync(path.join(goalsDir, "state"), { recursive: true });
    fs.writeFileSync(path.join(goalsDir, "goals", "g.md"), "predicate: true\n");
    fs.writeFileSync(path.join(goalsDir, "state", "g.status"), "FAIL\n");
    const infraDir = path.join(caseDir, "infra");
    fs.mkdirSync(infraDir, { recursive: true });

    const result = aggregateTrackedCentres({
      projects: [{ centre: "Flux", roadmapPath: flux }],
      infra: { goalsDir, infraDir },
    });

    expect(result).toEqual([
      { centre: "Flux", title: "T01 — Ship it", urgency: "next-task" },
      { centre: "homelab-infra", title: "standing goal violated: g", urgency: "violation" },
    ]);
  });
});

import { describe, it, expect, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { gatherSignals, listProjectSources } from "./signals";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lifeos-projects-test-"));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

const NOW = new Date();
const NONE: ReadonlySet<string> = new Set();

function makeRepo(name: string, opts: { roadmap?: string; commit?: boolean } = {}): string {
  const dir = path.join(tmp, name);
  fs.mkdirSync(dir, { recursive: true });
  execFileSync("git", ["-C", dir, "init", "-q", "-b", "main"]);
  execFileSync("git", ["-C", dir, "config", "user.email", "t@example.com"]);
  execFileSync("git", ["-C", dir, "config", "user.name", "T"]);
  if (opts.roadmap !== undefined) fs.writeFileSync(path.join(dir, "ROADMAP.md"), opts.roadmap);
  if (opts.commit !== false) {
    fs.writeFileSync(path.join(dir, "README.md"), "hi");
    execFileSync("git", ["-C", dir, "add", "-A"]);
    execFileSync("git", ["-C", dir, "commit", "-q", "-m", "initial"]);
  }
  return dir;
}

describe("gatherSignals — reads the repo, judges nothing itself", () => {
  it("derives a status from a real repo with open work", () => {
    const dir = makeRepo("alive", {
      roadmap: "- [ ] **T01 — Do the thing**\n- [x] **T00 — Done**\n",
    });
    const entry = gatherSignals({ name: "alive", dir }, NONE, NOW);
    expect(entry.error).toBeNull();
    expect(entry.state?.status).toBe("moving");
    expect(entry.state?.nextAction?.title).toBe("T01 — Do the thing");
    expect(entry.lastCommitAt).not.toBeNull();
    expect(entry.openTaskCount).toBe(1);
  });

  it("honours the archived flag it is handed", () => {
    const dir = makeRepo("shelved", { roadmap: "- [ ] **T01 — Open**\n" });
    const entry = gatherSignals({ name: "shelved", dir }, new Set(["shelved"]), NOW);
    expect(entry.state?.status).toBe("archived");
  });

  it("a repo with no ROADMAP still gets a status", () => {
    const dir = makeRepo("bare");
    const entry = gatherSignals({ name: "bare", dir }, NONE, NOW);
    expect(entry.error).toBeNull();
    expect(entry.state?.status).toBe("moving");
    expect(entry.state?.nextAction).toBeNull();
  });

  it("a repo with no commits yet is stalled, not an error", () => {
    // A real repo that has simply never been committed to (trackit, on the
    // live box). It is readable; there is just nothing in it yet, and the
    // right answer is "this has not started", not "this is broken".
    const dir = makeRepo("empty", { commit: false, roadmap: "- [ ] **T01 — Open**\n" });
    const entry = gatherSignals({ name: "empty", dir }, NONE, NOW);
    expect(entry.error).toBeNull();
    expect(entry.lastCommitAt).toBeNull();
    expect(entry.state?.status).toBe("stalled");
    expect(entry.state?.stallReason).toContain("never committed");
  });

  it("a repo that cannot be read reports its error and keeps its place", () => {
    // A directory that is not a git repo at all — the shape a broken mount,
    // a moved project or a permissions problem takes.
    const dir = path.join(tmp, "not-a-repo");
    fs.mkdirSync(dir, { recursive: true });
    const entry = gatherSignals({ name: "not-a-repo", dir }, NONE, NOW);
    expect(entry.error).toBeTruthy();
    expect(entry.state).toBeNull();
    // It is still an entry — the list must not quietly lose a project.
    expect(entry.name).toBe("not-a-repo");
  });

  it("an unreadable ROADMAP is an error, not silently treated as absent", () => {
    const dir = makeRepo("bad-roadmap");
    // A directory where ROADMAP.md should be: readFileSync raises EISDIR.
    fs.mkdirSync(path.join(dir, "ROADMAP.md"));
    const entry = gatherSignals({ name: "bad-roadmap", dir }, NONE, NOW);
    expect(entry.error).toContain("ROADMAP");
    expect(entry.state).toBeNull();
  });

  it("surfaces the last autoloop commit, and nothing when there is none", () => {
    const dir = makeRepo("touched", { roadmap: "- [ ] **T01 — Open**\n" });
    expect(gatherSignals({ name: "touched", dir }, NONE, NOW).autoloopTouchedAt).toBeNull();

    fs.writeFileSync(path.join(dir, "b.md"), "x");
    execFileSync("git", ["-C", dir, "add", "-A"]);
    execFileSync("git", ["-C", dir, "commit", "-q", "-m", "autoloop: did a thing"]);
    expect(gatherSignals({ name: "touched", dir }, NONE, NOW).autoloopTouchedAt).not.toBeNull();
  });

  it("never writes to the repo it reads", () => {
    const dir = makeRepo("readonly-check", { roadmap: "- [ ] **T01 — Open**\n" });
    const before = fs.readFileSync(path.join(dir, "ROADMAP.md"), "utf-8");
    const head = execFileSync("git", ["-C", dir, "rev-parse", "HEAD"], { encoding: "utf-8" });
    gatherSignals({ name: "readonly-check", dir }, NONE, NOW);
    expect(fs.readFileSync(path.join(dir, "ROADMAP.md"), "utf-8")).toBe(before);
    expect(execFileSync("git", ["-C", dir, "rev-parse", "HEAD"], { encoding: "utf-8" })).toBe(head);
    expect(execFileSync("git", ["-C", dir, "status", "--porcelain"], { encoding: "utf-8" })).toBe("");
  });
});

describe("listProjectSources — projects exist because repos exist", () => {
  it("finds git repos under the apps root and skips everything else", () => {
    const apps = path.join(tmp, "roots", "apps");
    fs.mkdirSync(apps, { recursive: true });
    fs.mkdirSync(path.join(apps, "plain-dir"), { recursive: true });
    fs.writeFileSync(path.join(apps, "a-file.md"), "not a project");
    const repo = path.join(apps, "real");
    fs.mkdirSync(repo, { recursive: true });
    execFileSync("git", ["-C", repo, "init", "-q"]);

    const found = listProjectSources({ appsDir: apps, infraDir: path.join(tmp, "nope") });
    expect(found.map((s) => s.name)).toEqual(["real"]);
  });

  it("survives a missing apps root instead of throwing", () => {
    expect(listProjectSources({ appsDir: "/nope/nope", infraDir: "/nope/nope" })).toEqual([]);
  });
});

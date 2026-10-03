import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { explainGoal, goalLabel, whatFailed } from "./goal-explain";

describe("whatFailed", () => {
  it("returns the first sentence after the alert marker", () => {
    const text = "predicate: true\non-violation: alert. The unit is inactive or the home page does not answer 200. Check `journalctl -u x`; do not auto-fix.\nretire-when: never";
    expect(whatFailed(text)).toBe("The unit is inactive or the home page does not answer 200.");
  });
  it("returns null without an on-violation line", () => {
    expect(whatFailed("predicate: true")).toBeNull();
  });
  it("shortens a very long first sentence at a word", () => {
    const out = whatFailed(`on-violation: alert. ${"word ".repeat(80)}end.`)!;
    expect(out.length).toBeLessThanOrEqual(161);
    expect(out.endsWith("…")).toBe(true);
  });
});

describe("goalLabel", () => {
  it("humanises a slug", () => {
    expect(goalLabel("autoloop-no-silent-demotion")).toBe("Autoloop no silent demotion");
  });
});

describe("explainGoal", () => {
  it("reads the goal file, and refuses anything that is not a plain slug", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "goals-"));
    try {
      writeFileSync(path.join(dir, "backup-fresh.md"), "on-violation: alert. The newest backup is over 26 hours old. Check cron.\n");
      expect(explainGoal("backup-fresh", dir)).toBe("The newest backup is over 26 hours old.");
      expect(explainGoal("../etc/passwd", dir)).toBeNull();
      expect(explainGoal("missing-goal", dir)).toBeNull();
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

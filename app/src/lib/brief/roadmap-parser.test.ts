import { describe, it, expect } from "vitest";
import { parseRoadmap } from "./roadmap-parser";

describe("parseRoadmap", () => {
  it("finds the first unchecked non-NEEDS-USER task and skips checked ones", () => {
    const fixture = `
## Tasks

- [x] **T01 — Done already** (M) — nothing to see here.
- [ ] **T02 — Next up** (S) — do this one.
- [ ] **T03 — Later** (S) — this one waits.
`;
    const result = parseRoadmap(fixture);
    expect(result.nextTask).toEqual({ title: "T02 — Next up", needsUser: false });
    expect(result.needsUserTasks).toEqual([]);
  });

  it("collects all unchecked NEEDS-USER tasks separately from nextTask", () => {
    const fixture = `
- [ ] **T01 — NEEDS-USER: pick a color** (S) — asks a question.
- [ ] **T02 — Regular task** (M) — do the work.
- [ ] **T03 — NEEDS-USER: pick another color** (S) — asks another question.
`;
    const result = parseRoadmap(fixture);
    expect(result.needsUserTasks).toEqual([
      { title: "T01 — NEEDS-USER: pick a color", needsUser: true },
      { title: "T03 — NEEDS-USER: pick another color", needsUser: true },
    ]);
    expect(result.nextTask).toEqual({ title: "T02 — Regular task", needsUser: false });
  });

  it("returns null nextTask and empty needsUserTasks when every task is checked", () => {
    const fixture = `
- [x] **T01 — Done** (S) — finished.
- [x] **T02 — NEEDS-USER: also done** (S) — decided already.
`;
    const result = parseRoadmap(fixture);
    expect(result.nextTask).toBeNull();
    expect(result.needsUserTasks).toEqual([]);
  });

  it("ignores non-task lines (log entries, headers, prose)", () => {
    const fixture = `
# Roadmap

Some prose here. Not a task.

## Log

- Did a thing on 2026-07-09, not a checkbox task line.

- [ ] **T01 — Real task** (S) — the only one.
`;
    const result = parseRoadmap(fixture);
    expect(result.nextTask).toEqual({ title: "T01 — Real task", needsUser: false });
  });

  it("handles a dropped (strikethrough) task without crashing", () => {
    const fixture = `
- [x] ~~**T01 — Dropped scope**~~ *(2026-07-07: DROPPED per Samy)*
- [ ] **T02 — Still active** (S) — pick this one.
`;
    const result = parseRoadmap(fixture);
    expect(result.nextTask).toEqual({ title: "T02 — Still active", needsUser: false });
  });
});

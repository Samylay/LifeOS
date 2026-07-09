import { describe, it, expect } from "vitest";
import { parseRoadmap } from "./roadmap-parser";

describe("parseRoadmap", () => {
  it("finds the first unchecked non-NEEDS-SAMY task and skips checked ones", () => {
    const fixture = `
## Tasks

- [x] **T01 — Done already** (M) — nothing to see here.
- [ ] **T02 — Next up** (S) — do this one.
- [ ] **T03 — Later** (S) — this one waits.
`;
    const result = parseRoadmap(fixture);
    expect(result.nextTask).toEqual({ title: "T02 — Next up", needsSamy: false });
    expect(result.needsSamyTasks).toEqual([]);
  });

  it("collects all unchecked NEEDS-SAMY tasks separately from nextTask", () => {
    const fixture = `
- [ ] **T01 — NEEDS-SAMY: pick a color** (S) — asks a question.
- [ ] **T02 — Regular task** (M) — do the work.
- [ ] **T03 — NEEDS-SAMY: pick another color** (S) — asks another question.
`;
    const result = parseRoadmap(fixture);
    expect(result.needsSamyTasks).toEqual([
      { title: "T01 — NEEDS-SAMY: pick a color", needsSamy: true },
      { title: "T03 — NEEDS-SAMY: pick another color", needsSamy: true },
    ]);
    expect(result.nextTask).toEqual({ title: "T02 — Regular task", needsSamy: false });
  });

  it("returns null nextTask and empty needsSamyTasks when every task is checked", () => {
    const fixture = `
- [x] **T01 — Done** (S) — finished.
- [x] **T02 — NEEDS-SAMY: also done** (S) — decided already.
`;
    const result = parseRoadmap(fixture);
    expect(result.nextTask).toBeNull();
    expect(result.needsSamyTasks).toEqual([]);
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
    expect(result.nextTask).toEqual({ title: "T01 — Real task", needsSamy: false });
  });

  it("handles a dropped (strikethrough) task without crashing", () => {
    const fixture = `
- [x] ~~**T01 — Dropped scope**~~ *(2026-07-07: DROPPED per Samy)*
- [ ] **T02 — Still active** (S) — pick this one.
`;
    const result = parseRoadmap(fixture);
    expect(result.nextTask).toEqual({ title: "T02 — Still active", needsSamy: false });
  });
});

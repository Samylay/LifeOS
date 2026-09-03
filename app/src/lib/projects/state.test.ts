import { describe, it, expect } from "vitest";
import {
  STALL_DAYS,
  deriveStatus,
  stallReason,
  nextAction,
  deriveProjectState,
  type ProjectSignals,
} from "./state";
import { parseRoadmap } from "@/lib/brief/roadmap-parser";

const NOW = new Date("2026-09-04T12:00:00.000Z");
const daysBefore = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);

const ROADMAP_OPEN = `
## Tasks
- [x] **T01 — Done thing** (S) — shipped
- [ ] **T02 — Wire the thing** (M) — do it
- [ ] **T03 — NEEDS-USER: pick a colour** (S) — your call
`;
const ROADMAP_ONLY_NEEDS_USER = `
- [x] **T01 — Done thing**
- [ ] **T02 — NEEDS-USER: approve the cut**
`;
const ROADMAP_ALL_DONE = `
- [x] **T01 — Done thing**
- [x] **T02 — Also done**
`;

function signals(over: Partial<ProjectSignals> = {}): ProjectSignals {
  return {
    name: "lifeos",
    lastCommitAt: daysBefore(1),
    roadmap: parseRoadmap(ROADMAP_OPEN),
    archived: false,
    completed: false,
    ...over,
  };
}

describe("deriveStatus — one status per set of signals", () => {
  it("recent commits with open tasks is moving", () => {
    expect(deriveStatus(signals(), NOW)).toBe("moving");
  });

  it("no commit past the stall threshold with open tasks is stalled", () => {
    expect(deriveStatus(signals({ lastCommitAt: daysBefore(STALL_DAYS + 1) }), NOW)).toBe("stalled");
  });

  it("no open tasks is done, however long ago it last moved", () => {
    const s = signals({ roadmap: parseRoadmap(ROADMAP_ALL_DONE), lastCommitAt: daysBefore(400) });
    expect(deriveStatus(s, NOW)).toBe("done");
  });

  it("only a NEEDS-USER task open is blocked, not stalled", () => {
    // Waiting on Samy is not the same failure as quietly stopping, and the
    // fix is different: one needs a decision, the other needs reviving.
    const s = signals({
      roadmap: parseRoadmap(ROADMAP_ONLY_NEEDS_USER),
      lastCommitAt: daysBefore(STALL_DAYS + 30),
    });
    expect(deriveStatus(s, NOW)).toBe("blocked");
  });

  it("archived wins over everything", () => {
    expect(deriveStatus(signals({ archived: true, lastCommitAt: daysBefore(0) }), NOW)).toBe("archived");
  });

  it("completed reads as done even with open tasks left behind", () => {
    expect(deriveStatus(signals({ completed: true }), NOW)).toBe("done");
  });

  it("a project with no ROADMAP is judged on commits alone", () => {
    expect(deriveStatus(signals({ roadmap: null }), NOW)).toBe("moving");
    expect(deriveStatus(signals({ roadmap: null, lastCommitAt: daysBefore(STALL_DAYS + 1) }), NOW)).toBe("stalled");
  });

  it("a project that never committed and has open work is stalled, not moving", () => {
    expect(deriveStatus(signals({ lastCommitAt: null }), NOW)).toBe("stalled");
  });
});

describe("the stall threshold, at its boundary", () => {
  it("is not stalled the day before the threshold", () => {
    expect(deriveStatus(signals({ lastCommitAt: daysBefore(STALL_DAYS - 1) }), NOW)).toBe("moving");
  });

  it("is not stalled exactly on the threshold", () => {
    expect(deriveStatus(signals({ lastCommitAt: daysBefore(STALL_DAYS) }), NOW)).toBe("moving");
  });

  it("is stalled the day after the threshold", () => {
    expect(deriveStatus(signals({ lastCommitAt: daysBefore(STALL_DAYS + 1) }), NOW)).toBe("stalled");
  });
});

describe("stallReason — the rule is visible, not a guess", () => {
  it("names the days since the last commit and the open work", () => {
    const reason = stallReason(signals({ lastCommitAt: daysBefore(41) }), NOW);
    expect(reason).toContain("41");
    expect(reason).toMatch(/open/i);
  });

  it("says so when a project has never committed", () => {
    const reason = stallReason(signals({ lastCommitAt: null }), NOW);
    expect(reason).toBeTruthy();
    expect(reason).not.toContain("NaN");
  });

  it("is null when the project is not stalled", () => {
    expect(stallReason(signals(), NOW)).toBeNull();
  });
});

describe("nextAction — what to pick up", () => {
  it("is the first open non-NEEDS-USER task", () => {
    expect(nextAction(signals())).toEqual({ title: "T02 — Wire the thing", needsUser: false });
  });

  it("is the NEEDS-USER ask when that is all that is left", () => {
    const action = nextAction(signals({ roadmap: parseRoadmap(ROADMAP_ONLY_NEEDS_USER) }));
    expect(action?.needsUser).toBe(true);
    expect(action?.title).toContain("NEEDS-USER");
  });

  it("is null when there is nothing open", () => {
    expect(nextAction(signals({ roadmap: parseRoadmap(ROADMAP_ALL_DONE) }))).toBeNull();
    expect(nextAction(signals({ roadmap: null }))).toBeNull();
  });
});

describe("deriveProjectState — the whole judgement in one call", () => {
  it("a stalled project carries its reason and its next task", () => {
    const state = deriveProjectState(signals({ lastCommitAt: daysBefore(60) }), NOW);
    expect(state.status).toBe("stalled");
    expect(state.stallReason).toContain("60");
    expect(state.nextAction?.title).toBe("T02 — Wire the thing");
  });

  it("a moving project carries no stall reason", () => {
    expect(deriveProjectState(signals(), NOW).stallReason).toBeNull();
  });

  it("never reports a status outside the closed set", () => {
    const all = ["moving", "stalled", "blocked", "archived", "done"];
    const cases: Partial<ProjectSignals>[] = [
      {}, { archived: true }, { completed: true }, { lastCommitAt: null },
      { roadmap: null }, { roadmap: parseRoadmap(ROADMAP_ALL_DONE) },
      { roadmap: parseRoadmap(ROADMAP_ONLY_NEEDS_USER) },
      { lastCommitAt: daysBefore(999) },
    ];
    for (const c of cases) {
      expect(all).toContain(deriveProjectState(signals(c), NOW).status);
    }
  });

  it("is pure — the same signals give the same answer", () => {
    const s = signals({ lastCommitAt: daysBefore(30) });
    expect(deriveProjectState(s, NOW)).toEqual(deriveProjectState(s, NOW));
  });
});

// T-projects-rework-01 — what a project's repo signals MEAN.
//
// Pure judgement: no filesystem, no git, no database. Callers gather the
// signals and hand them here. That split is the point — it makes the stall
// rule testable against fixtures instead of against Samy's actual machine,
// and it mirrors roadmap-parser.ts, which takes raw contents for the same
// reason.
//
// The brief this serves: the surface must still be true after Samy ignores it
// for six weeks. Every value below is derived from something the repo already
// knows, so there is nothing to maintain and nothing to go stale.
import type { ParsedRoadmap, RoadmapTask } from "@/lib/brief/roadmap-parser";

// Days without a commit before an active project counts as stalled.
//
// 14 is a starting value, not a discovered constant: it is long enough that a
// normal week off does not raise a false alarm, short enough that the six-week
// silence on "Content OS" (the failure that prompted this rework) would have
// been caught four times over. It is exported so the rule can be shown to
// Samy and changed in one place if it proves wrong.
export const STALL_DAYS = 14;

export type ProjectStatus = "moving" | "stalled" | "blocked" | "archived" | "done";

export interface ProjectSignals {
  name: string;
  // null = no commits, or a repo whose history could not be read.
  lastCommitAt: Date | null;
  // null = no ROADMAP.md, which is not an error — some repos have none.
  roadmap: ParsedRoadmap | null;
  archived: boolean;
  completed: boolean;
  autoloopTouchedAt?: Date | null;
}

export interface ProjectState {
  status: ProjectStatus;
  // The rule behind a stall verdict, in words. Null unless stalled — a
  // judgement Samy cannot see the reasoning for is one he cannot trust.
  stallReason: string | null;
  nextAction: RoadmapTask | null;
}

function daysSince(then: Date, now: Date): number {
  return Math.floor((now.getTime() - then.getTime()) / (24 * 60 * 60 * 1000));
}

function openTaskCount(roadmap: ParsedRoadmap | null): number {
  if (!roadmap) return 0;
  return roadmap.needsUserTasks.length + (roadmap.nextTask ? 1 : 0);
}

export function deriveStatus(signals: ProjectSignals, now: Date): ProjectStatus {
  // Samy said so, explicitly. That outranks anything inferred from the repo.
  if (signals.archived) return "archived";
  if (signals.completed) return "done";

  // A repo with no ROADMAP is not finished, it is just untracked: judge it on
  // commits alone rather than declaring it done on missing evidence.
  if (signals.roadmap && openTaskCount(signals.roadmap) === 0) return "done";

  // Waiting on Samy is not the same failure as quietly stopping: one needs a
  // decision from him, the other needs reviving. Calling it stalled would
  // blame the project for a queue only he can clear.
  if (signals.roadmap && !signals.roadmap.nextTask && signals.roadmap.needsUserTasks.length > 0) {
    return "blocked";
  }

  // Never committed, with work still open, is the stalled case — it has not
  // started rather than not continued, and both need the same nudge.
  if (!signals.lastCommitAt) return "stalled";

  return daysSince(signals.lastCommitAt, now) > STALL_DAYS ? "stalled" : "moving";
}

export function stallReason(signals: ProjectSignals, now: Date): string | null {
  if (deriveStatus(signals, now) !== "stalled") return null;

  const open = openTaskCount(signals.roadmap);
  const work = signals.roadmap === null
    ? "no ROADMAP to say what is left"
    : `${open} task${open === 1 ? "" : "s"} still open`;

  if (!signals.lastCommitAt) return `never committed, ${work}`;
  const days = daysSince(signals.lastCommitAt, now);
  return `no commit in ${days} day${days === 1 ? "" : "s"} (over ${STALL_DAYS}), ${work}`;
}

// What to pick up. A NEEDS-USER ask is surfaced when it is the only thing
// left, because "waiting on you" IS the next action then — but it never
// outranks real work, matching the first-unchecked-task-wins rule the nightly
// executor already follows.
export function nextAction(signals: ProjectSignals): RoadmapTask | null {
  const roadmap = signals.roadmap;
  if (!roadmap) return null;
  if (roadmap.nextTask) return roadmap.nextTask;
  return roadmap.needsUserTasks[0] ?? null;
}

export function deriveProjectState(signals: ProjectSignals, now: Date): ProjectState {
  return {
    status: deriveStatus(signals, now),
    stallReason: stallReason(signals, now),
    nextAction: nextAction(signals),
  };
}

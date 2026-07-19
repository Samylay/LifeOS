"use client";

import { useState } from "react";
import {
  Plus,
  X,
  Check,
  Trash2,
  Sparkles,
  ChevronDown,
  Circle,
  CheckCircle2,
  Loader2,
  Target,
  ListChecks,
  CalendarCheck,
  ArrowUpRight,
  ArrowRight,
} from "lucide-react";
import { useGoals } from "@/lib/use-goals";
import { useToast } from "@/components/toast";
import {
  quarterOf,
  mondayOf,
  sessionsThisWeekForGoal,
  goalReadiness,
  milestoneProgress,
  goalPlanState,
  lastSessionDaysAgo,
  withShipActivity,
  type Goal,
  type GoalSession,
  type GoalPlanState,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";

// --- Plan-state vocabulary ------------------------------------------------
// One label per goal that makes the gap between a vague wish and a decided,
// actionable plan legible on the card face.

const PLAN_STATE: Record<GoalPlanState, { label: string; color: string }> = {
  unplanned: { label: "Needs a plan", color: "#F59E0B" },
  planned: { label: "Planned", color: "#3B82F6" },
  "in-motion": { label: "In motion", color: "var(--primary)" },
  stale: { label: "Stale", color: "#EF4444" },
};

// Sort so the goals that need a decision surface first.
export const GOAL_STATE_RANK: Record<GoalPlanState, number> = {
  unplanned: 0,
  stale: 1,
  planned: 2,
  "in-motion": 3,
};

function PlanBadge({ state }: { state: GoalPlanState }) {
  const { label, color } = PLAN_STATE[state];
  return (
    <span
      className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md"
      style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color }}
    >
      {label}
    </span>
  );
}

// Three planning checkpoints: outcome → milestones → this week. Filled segments
// show, at a glance, how far a goal is from being an actionable plan.
function ReadinessTrack({
  hasOutcome,
  hasMilestones,
  hasWeek,
}: {
  hasOutcome: boolean;
  hasMilestones: boolean;
  hasWeek: boolean;
}) {
  const steps: { on: boolean; label: string; Icon: typeof Target }[] = [
    { on: hasOutcome, label: "Outcome", Icon: Target },
    { on: hasMilestones, label: "Milestones", Icon: ListChecks },
    { on: hasWeek, label: "This week", Icon: CalendarCheck },
  ];
  return (
    <div className="flex items-center gap-1.5" aria-hidden>
      {steps.map((s) => (
        <div
          key={s.label}
          title={`${s.label}: ${s.on ? "done" : "not set"}`}
          className={cn(
            "flex items-center gap-1 rounded-md px-1.5 py-0.5 transition-colors",
            s.on ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground/70"
          )}
        >
          <s.Icon size={11} />
          <span className="text-[10px] font-medium">{s.label}</span>
        </div>
      ))}
    </div>
  );
}

// --- Create form ---

export function GoalEditor({
  onSave,
  onCancel,
}: {
  onSave: (data: { title: string; quarter: string; why?: string; outcome?: string }) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [quarter, setQuarter] = useState(quarterOf());
  const [why, setWhy] = useState("");
  const [outcome, setOutcome] = useState("");

  return (
    <div className="rounded-xl border border-primary bg-card p-4 space-y-3 enter">
      <Input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Objective for the quarter…"
        className="text-sm font-medium"
      />
      <div className="flex gap-2 flex-wrap">
        <Input
          value={quarter}
          onChange={(e) => setQuarter(e.target.value)}
          placeholder="2026-Q3"
          className="w-28 text-xs text-center"
        />
        <Input
          value={why}
          onChange={(e) => setWhy(e.target.value)}
          placeholder="Why it matters (optional)"
          className="flex-1 min-w-0 text-xs"
        />
      </div>
      <Input
        value={outcome}
        onChange={(e) => setOutcome(e.target.value)}
        placeholder="Definition of done (optional — Claude can draft this)"
        className="text-xs"
      />
      <div className="flex items-center gap-2 justify-end">
        <Button variant="secondary" size="sm" onClick={onCancel} className="gap-1.5 text-xs">
          <X size={14} /> Cancel
        </Button>
        <Button
          size="sm"
          onClick={() =>
            title.trim() &&
            onSave({
              title: title.trim(),
              quarter: quarter.trim() || quarterOf(),
              why: why.trim() || undefined,
              outcome: outcome.trim() || undefined,
            })
          }
          disabled={!title.trim()}
          className="gap-1.5 text-sm px-4"
        >
          <Check size={14} /> Create
        </Button>
      </div>
    </div>
  );
}

// --- Sparkline ---

// 4-week activity strip from logged sessions AND ships on this goal's
// projects — one bar per day, lit on days with activity (brighter for
// multiple). A quiet momentum readout, static by design.
function SessionSparkline({ sessions }: { sessions: GoalSession[] }) {
  const DAYS = 28;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const counts = new Map<string, number>();
  for (const s of sessions) counts.set(s.date, (counts.get(s.date) ?? 0) + 1);
  const cols = Array.from({ length: DAYS }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (DAYS - 1 - i));
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return counts.get(key) ?? 0;
  });
  return (
    <div className="flex items-end gap-[3px] h-5" aria-label={`Activity, last ${DAYS} days`}>
      {cols.map((c, i) => (
        <span
          key={i}
          className={cn("flex-1 rounded-[2px]", c > 0 ? "bg-primary" : "bg-muted")}
          style={{
            height: c > 0 ? "100%" : "24%",
            opacity: c > 0 ? Math.min(1, 0.45 + c * 0.28) : 1,
          }}
        />
      ))}
    </div>
  );
}

// --- Goal section ---
//
// The grouping unit of the unified Projects surface: a goal header (the old
// goal card, unabridged) with the projects that serve it nested beneath a
// connecting rail. Ships on those projects are folded into the goal's
// activity via `withShipActivity`, so shipping IS working the goal.

export function GoalSection({
  goal: rawGoal,
  shipDates,
  delay,
  children,
  projectCount,
  nest = true,
}: {
  goal: Goal;
  /** Local YYYY-MM-DD dates of ships logged against this goal's projects. */
  shipDates: string[];
  delay: number;
  /** Nested project cards. */
  children?: React.ReactNode;
  projectCount: number;
  /** Render the nested-projects rail (off for archive listings). */
  nest?: boolean;
}) {
  const { updateGoal, deleteGoal, addCommitment, toggleCommitment, removeCommitment, toggleMilestone, logSession, draftPlan } = useGoals();
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [newCommit, setNewCommit] = useState("");
  const [drafting, setDrafting] = useState(false);

  // All readouts below see ships as sessions.
  const goal = withShipActivity(rawGoal, shipDates);

  const week = mondayOf();
  const thisQuarter = quarterOf();
  const pastQuarter = goal.status === "active" && goal.quarter < thisQuarter;
  const { hasOutcome, hasMilestones, hasWeek, weekCommits } = goalReadiness(goal, week);
  const doneCount = weekCommits.filter((c) => c.done).length;
  const sessions = sessionsThisWeekForGoal(goal, week);
  const state = goalPlanState(goal, week);
  const lastAgo = lastSessionDaysAgo(goal);
  const weekPct = weekCommits.length > 0 ? (doneCount / weekCommits.length) * 100 : 0;

  const draft = async () => {
    setDrafting(true);
    try {
      const r = await draftPlan(goal.id);
      toast(r ? `Claude added ${r.added} commitment${r.added === 1 ? "" : "s"}` : "No draft");
      if (r) setExpanded(true);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Draft failed");
    } finally {
      setDrafting(false);
    }
  };

  const DraftButton = ({ primary }: { primary?: boolean }) => (
    <Button
      variant={primary ? "default" : "ghost"}
      size="sm"
      onClick={draft}
      disabled={drafting}
      className={cn("gap-1.5 text-xs", !primary && "text-primary bg-primary/10 hover:bg-primary/15")}
    >
      {drafting ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
      {drafting ? "Drafting…" : primary ? "Draft plan with Claude" : "Draft with Claude"}
    </Button>
  );

  return (
    <section className="enter" style={{ ["--enter-delay" as string]: `${delay}ms` }}>
      <div className="rounded-xl border border-border border-l-[3px] border-l-primary bg-card p-4">
        <div className="flex items-start gap-3">
          <button
            onClick={() => setExpanded((e) => !e)}
            aria-expanded={expanded}
            className="flex-1 text-left min-w-0 rounded-lg -m-1 p-1 transition-transform duration-150 active:scale-[0.99]"
          >
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground/70">
                {goal.quarter}
              </span>
              <PlanBadge state={state} />
              {goal.status !== "active" && (
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">{goal.status}</span>
              )}
            </div>
            <p className="text-sm font-semibold mt-1.5 line-clamp-2 text-foreground" title={goal.title}>{goal.title}</p>
            {goal.why && (
              <p className="text-xs mt-0.5 line-clamp-1 text-muted-foreground/70">{goal.why}</p>
            )}
          </button>
          <ChevronDown
            size={16}
            className={cn(
              "shrink-0 mt-1 text-muted-foreground/70 transition-transform duration-200",
              expanded && "rotate-180"
            )}
          />
        </div>

        {/* Past-quarter goal that's still active: burying it made the page look
            dead. Surface the decision instead — carry it or close it. */}
        {pastQuarter && (
          <div className="mt-3 flex items-center gap-2 flex-wrap rounded-lg px-3 py-2" style={{ background: "#F59E0B10", border: "1px solid #F59E0B33" }}>
            <span className="text-[11px] flex-1 min-w-0" style={{ color: "#F59E0B" }}>
              From {goal.quarter} — still a goal, or done with it?
            </span>
            <button
              onClick={() => { updateGoal(goal.id, { quarter: thisQuarter }); toast(`Carried into ${thisQuarter}`); }}
              className="flex items-center gap-1 text-[11px] font-semibold rounded-md px-2 py-1 text-primary bg-primary/10 transition-transform duration-150 active:scale-[0.95]"
            >
              <ArrowRight size={12} /> Carry into {thisQuarter}
            </button>
            <button
              onClick={() => { updateGoal(goal.id, { status: "done" }); toast("Goal closed"); }}
              className="text-[11px] font-medium text-muted-foreground/70 transition-transform duration-150 active:scale-[0.95]"
            >
              Close it
            </button>
          </div>
        )}

        {/* At-a-glance readiness + week momentum */}
        <div className="mt-3 space-y-2">
          <ReadinessTrack hasOutcome={hasOutcome} hasMilestones={hasMilestones} hasWeek={hasWeek} />
          {weekCommits.length > 0 ? (
            <div>
              <div className="flex items-center justify-between text-[11px] mb-1 text-muted-foreground/70">
                <span>This week</span>
                <span className="font-mono">{doneCount}/{weekCommits.length}</span>
              </div>
              <Progress value={weekPct} className="h-1.5 bg-muted [&>div]:duration-300 [&>div]:[transition-timing-function:var(--ease-out-custom)]" />
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground/70">
              No commitment set for this week yet.
            </p>
          )}
          <p className="text-[11px] text-muted-foreground/70">
            {sessions} session{sessions === 1 ? "" : "s"} this week (ships count)
            {lastAgo !== null && ` · last worked ${lastAgo === 0 ? "today" : `${lastAgo}d ago`}`}
          </p>
          {goal.sessions.length > 0 && <SessionSparkline sessions={goal.sessions} />}
        </div>

        {/* Face CTA: close the vague→decided gap without expanding */}
        {!expanded && state === "unplanned" && (
          <div className="mt-3">
            <DraftButton primary />
          </div>
        )}
        {!expanded && state === "stale" && (
          <p className="mt-3 text-[11px]" style={{ color: "#F59E0B" }}>
            Not touched in a while — ship something on a project below, or set this week&apos;s commitment.
          </p>
        )}

        {expanded && (
          <div className="mt-3 pt-3 space-y-4 border-t border-border enter">
            {goal.outcome ? (
              <p className="text-xs text-muted-foreground">
                <span className="font-semibold text-muted-foreground/70">Done when: </span>{goal.outcome}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground/70">
                No definition of done yet — draft one to make &ldquo;done&rdquo; unambiguous.
              </p>
            )}

            {/* This week */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest mb-1.5 text-muted-foreground/70">This week</p>
              <div className="space-y-1">
                {weekCommits.map((c) => (
                  <div key={c.id} className="flex items-center gap-2 group">
                    <button
                      onClick={() => toggleCommitment(goal.id, c.id)}
                      aria-label={c.done ? "Mark not done" : "Mark done"}
                      className={cn(
                        "shrink-0 transition-transform duration-150 active:scale-[0.85]",
                        c.done ? "text-primary" : "text-muted-foreground/70"
                      )}
                    >
                      {c.done ? <CheckCircle2 size={16} /> : <Circle size={16} />}
                    </button>
                    <span className={cn("text-sm flex-1 text-foreground", c.done && "line-through opacity-60")}>
                      {c.text}
                    </span>
                    <button
                      onClick={() => removeCommitment(goal.id, c.id)}
                      aria-label="Remove commitment"
                      className="shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground/70 transition-transform duration-150 active:scale-[0.85]"
                    >
                      <X size={13} />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-1.5 mt-2">
                <Input
                  value={newCommit}
                  onChange={(e) => setNewCommit(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && newCommit.trim()) { addCommitment(goal.id, newCommit); setNewCommit(""); } }}
                  placeholder="Add a commitment for this week…"
                  className="flex-1 text-xs"
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => { if (newCommit.trim()) { addCommitment(goal.id, newCommit); setNewCommit(""); } }}
                  aria-label="Add commitment"
                  className="text-primary"
                >
                  <Plus size={15} />
                </Button>
              </div>
            </div>

            {/* Milestones — checkable quarter steps, each promotable into this week */}
            {goal.milestones.length > 0 && (() => {
              const mp = milestoneProgress(goal);
              const done = goal.doneMilestones ?? [];
              return (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest mb-1.5 flex items-center gap-2 text-muted-foreground/70">
                    Milestones
                    <span className={cn("font-mono", mp.done === mp.total ? "text-primary" : "text-muted-foreground/70")}>{mp.done}/{mp.total}</span>
                  </p>
                  <ul className="space-y-1 text-sm">
                    {goal.milestones.map((m, i) => {
                      const isDone = done.includes(m);
                      return (
                        <li key={i} className="flex items-start gap-2 group">
                          <button
                            onClick={() => toggleMilestone(goal.id, m)}
                            aria-label={isDone ? "Mark milestone not done" : "Mark milestone done"}
                            className={cn(
                              "shrink-0 mt-0.5 h-4 w-4 rounded-[5px] border flex items-center justify-center transition-transform duration-150 active:scale-[0.85]",
                              isDone ? "border-primary bg-primary" : "border-border bg-transparent"
                            )}
                          >
                            {isDone && <Check size={11} className="text-primary-foreground" />}
                          </button>
                          <span className={cn("flex-1 text-muted-foreground", isDone && "line-through opacity-55")}>{m}</span>
                          {!isDone && (
                            <button
                              onClick={() => { addCommitment(goal.id, m); toast("Added to this week"); }}
                              title="Make this week's commitment"
                              className="shrink-0 flex items-center gap-0.5 text-[10px] font-medium text-primary opacity-0 group-hover:opacity-100 transition-transform duration-150 active:scale-[0.9]"
                            >
                              <ArrowUpRight size={12} /> This week
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })()}

            {/* Actions */}
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                size="sm"
                onClick={() => { logSession(goal.id); toast("Session logged"); }}
                className="gap-1.5 text-xs"
              >
                <Check size={13} /> Log session
              </Button>
              <DraftButton />
              {goal.status === "active" ? (
                <button
                  onClick={() => updateGoal(goal.id, { status: "done" })}
                  className="text-xs font-medium text-muted-foreground/70 transition-transform duration-150 active:scale-[0.97]"
                >
                  Mark done
                </button>
              ) : (
                <button
                  onClick={() => updateGoal(goal.id, { status: "active" })}
                  className="text-xs font-medium text-muted-foreground/70 transition-transform duration-150 active:scale-[0.97]"
                >
                  Reactivate
                </button>
              )}
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => deleteGoal(goal.id)}
                aria-label="Delete goal"
                title="Delete"
                className="ml-auto text-muted-foreground/70"
              >
                <Trash2 size={14} />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Projects serving this goal, nested under a connecting rail */}
      {nest && (
        <div className="ml-3 pl-3 mt-2 space-y-2" style={{ borderLeft: "2px solid color-mix(in srgb, var(--primary) 35%, transparent)" }}>
          {children}
          {projectCount === 0 && (
            <p className="text-[11px] py-1 text-muted-foreground/70">
              No project is driving this goal — link one below, or create one.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

"use client";

import { useState } from "react";
import {
  Flag,
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
} from "lucide-react";
import { useGoals } from "@/lib/use-goals";
import { useToast } from "@/components/toast";
import {
  quarterOf,
  mondayOf,
  commitmentsForWeek,
  sessionsThisWeekForGoal,
  goalReadiness,
  milestoneProgress,
  goalPlanState,
  lastSessionDaysAgo,
  type Goal,
  type GoalPlanState,
} from "@/lib/types";

// --- Plan-state vocabulary ------------------------------------------------
// One label per goal that makes the gap between a vague wish and a decided,
// actionable plan legible on the card face.

const PLAN_STATE: Record<GoalPlanState, { label: string; color: string }> = {
  unplanned: { label: "Needs a plan", color: "#F59E0B" },
  planned: { label: "Planned", color: "#3B82F6" },
  "in-motion": { label: "In motion", color: "var(--accent)" },
  stale: { label: "Stale", color: "#EF4444" },
};

// Sort so the goals that need a decision surface first.
const STATE_RANK: Record<GoalPlanState, number> = {
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
          className="flex items-center gap-1 rounded-md px-1.5 py-0.5 transition-colors"
          style={{
            background: s.on ? "var(--accent-bg)" : "var(--bg-tertiary)",
            color: s.on ? "var(--accent)" : "var(--text-tertiary)",
          }}
        >
          <s.Icon size={11} />
          <span className="text-[10px] font-medium">{s.label}</span>
        </div>
      ))}
    </div>
  );
}

// --- Create form ---

function GoalEditor({
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
  const s = {
    color: "var(--text-primary)",
    background: "var(--bg-tertiary)",
    border: "1px solid var(--border-primary)",
  };
  return (
    <div className="rounded-xl p-4 space-y-3 enter" style={{ background: "var(--bg-secondary)", border: "1px solid var(--accent)" }}>
      <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Objective for the quarter…"
        className="w-full text-sm font-medium outline-none rounded-lg px-3 py-2" style={s} />
      <div className="flex gap-2 flex-wrap">
        <input value={quarter} onChange={(e) => setQuarter(e.target.value)} placeholder="2026-Q3"
          className="w-28 text-xs outline-none rounded-lg px-2 py-1.5 text-center" style={s} />
        <input value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Why it matters (optional)"
          className="flex-1 min-w-0 text-xs outline-none rounded-lg px-2 py-1.5" style={s} />
      </div>
      <input value={outcome} onChange={(e) => setOutcome(e.target.value)} placeholder="Definition of done (optional — Claude can draft this)"
        className="w-full text-xs outline-none rounded-lg px-3 py-2" style={s} />
      <div className="flex items-center gap-2 justify-end">
        <button onClick={onCancel} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-transform duration-150 active:scale-[0.97]"
          style={{ color: "var(--text-secondary)", background: "var(--bg-tertiary)" }}>
          <X size={14} /> Cancel
        </button>
        <button onClick={() => title.trim() && onSave({ title: title.trim(), quarter: quarter.trim() || quarterOf(), why: why.trim() || undefined, outcome: outcome.trim() || undefined })}
          disabled={!title.trim()}
          className="flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium bg-sage-400 text-white hover:bg-sage-500 transition-[background,transform] duration-150 active:scale-[0.97] disabled:opacity-50">
          <Check size={14} /> Create
        </button>
      </div>
    </div>
  );
}

// --- Goal card ---

function GoalCard({ goal, delay }: { goal: Goal; delay: number }) {
  const { updateGoal, deleteGoal, addCommitment, toggleCommitment, removeCommitment, toggleMilestone, logSession, draftPlan } = useGoals();
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [newCommit, setNewCommit] = useState("");
  const [drafting, setDrafting] = useState(false);

  const week = mondayOf();
  const { hasOutcome, hasMilestones, hasWeek, weekCommits } = goalReadiness(goal, week);
  const doneCount = weekCommits.filter((c) => c.done).length;
  const sessions = sessionsThisWeekForGoal(goal, week);
  const state = goalPlanState(goal, week);
  const lastAgo = lastSessionDaysAgo(goal);
  const weekPct = weekCommits.length > 0 ? doneCount / weekCommits.length : 0;

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
    <button onClick={draft} disabled={drafting}
      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-transform duration-150 active:scale-[0.97] disabled:opacity-50 ${primary ? "bg-sage-400 text-white hover:bg-sage-500" : ""}`}
      style={primary ? undefined : { color: "var(--accent)", background: "var(--accent-bg)" }}>
      {drafting ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
      {drafting ? "Drafting…" : primary ? "Draft plan with Claude" : "Draft with Claude"}
    </button>
  );

  return (
    <div
      className="rounded-xl p-4 enter"
      style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)", ["--enter-delay" as string]: `${delay}ms` }}
    >
      <div className="flex items-start gap-3">
        <button
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
          className="flex-1 text-left min-w-0 rounded-lg -m-1 p-1 transition-transform duration-150 active:scale-[0.99]"
        >
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-md" style={{ background: "var(--bg-tertiary)", color: "var(--text-tertiary)" }}>
              {goal.quarter}
            </span>
            <PlanBadge state={state} />
            {goal.status !== "active" && (
              <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>{goal.status}</span>
            )}
          </div>
          <p className="text-sm font-medium mt-1.5 line-clamp-2" style={{ color: "var(--text-primary)" }} title={goal.title}>{goal.title}</p>
          {goal.why && (
            <p className="text-xs mt-0.5 line-clamp-1" style={{ color: "var(--text-tertiary)" }}>{goal.why}</p>
          )}
        </button>
        <ChevronDown
          size={16}
          className="shrink-0 mt-1 transition-transform duration-200"
          style={{ color: "var(--text-tertiary)", transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }}
        />
      </div>

      {/* At-a-glance readiness + week momentum */}
      <div className="mt-3 space-y-2">
        <ReadinessTrack hasOutcome={hasOutcome} hasMilestones={hasMilestones} hasWeek={hasWeek} />
        {weekCommits.length > 0 ? (
          <div>
            <div className="flex items-center justify-between text-[11px] mb-1" style={{ color: "var(--text-tertiary)" }}>
              <span>This week</span>
              <span className="font-mono">{doneCount}/{weekCommits.length}</span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-tertiary)" }}>
              <div
                className="h-full w-full rounded-full origin-left transition-transform duration-300"
                style={{ transform: `scaleX(${weekPct})`, background: "var(--accent)", transitionTimingFunction: "var(--ease-out-custom)" }}
              />
            </div>
          </div>
        ) : (
          <p className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
            No commitment set for this week yet.
          </p>
        )}
        <p className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
          {sessions} session{sessions === 1 ? "" : "s"} this week
          {lastAgo !== null && ` · last worked ${lastAgo === 0 ? "today" : `${lastAgo}d ago`}`}
        </p>
      </div>

      {/* Face CTA: close the vague→decided gap without expanding */}
      {!expanded && state === "unplanned" && (
        <div className="mt-3">
          <DraftButton primary />
        </div>
      )}
      {!expanded && state === "stale" && (
        <p className="mt-3 text-[11px]" style={{ color: "#F59E0B" }}>
          Not touched in a while — log a session or set this week&apos;s commitment.
        </p>
      )}

      {expanded && (
        <div className="mt-3 pt-3 space-y-4 enter" style={{ borderTop: "1px solid var(--border-primary)" }}>
          {goal.outcome ? (
            <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
              <span className="font-semibold" style={{ color: "var(--text-tertiary)" }}>Done when: </span>{goal.outcome}
            </p>
          ) : (
            <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
              No definition of done yet — draft one to make &ldquo;done&rdquo; unambiguous.
            </p>
          )}

          {/* This week */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: "var(--text-tertiary)" }}>This week</p>
            <div className="space-y-1">
              {weekCommits.map((c) => (
                <div key={c.id} className="flex items-center gap-2 group">
                  <button onClick={() => toggleCommitment(goal.id, c.id)} aria-label={c.done ? "Mark not done" : "Mark done"}
                    className="shrink-0 transition-transform duration-150 active:scale-[0.85]" style={{ color: c.done ? "var(--accent)" : "var(--text-tertiary)" }}>
                    {c.done ? <CheckCircle2 size={16} /> : <Circle size={16} />}
                  </button>
                  <span className="text-sm flex-1" style={{ color: "var(--text-primary)", textDecoration: c.done ? "line-through" : "none", opacity: c.done ? 0.6 : 1 }}>
                    {c.text}
                  </span>
                  <button onClick={() => removeCommitment(goal.id, c.id)} aria-label="Remove commitment"
                    className="shrink-0 opacity-0 group-hover:opacity-100 transition-transform duration-150 active:scale-[0.85]" style={{ color: "var(--text-tertiary)" }}>
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-1.5 mt-2">
              <input value={newCommit} onChange={(e) => setNewCommit(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && newCommit.trim()) { addCommitment(goal.id, newCommit); setNewCommit(""); } }}
                placeholder="Add a commitment for this week…"
                className="flex-1 text-xs outline-none rounded-lg px-2 py-1.5"
                style={{ color: "var(--text-primary)", background: "var(--bg-tertiary)", border: "1px solid var(--border-primary)" }} />
              <button onClick={() => { if (newCommit.trim()) { addCommitment(goal.id, newCommit); setNewCommit(""); } }}
                aria-label="Add commitment"
                className="shrink-0 p-1.5 rounded-lg transition-transform duration-150 active:scale-[0.9]" style={{ color: "var(--accent)" }}>
                <Plus size={15} />
              </button>
            </div>
          </div>

          {/* Milestones — checkable quarter steps, each promotable into this week */}
          {goal.milestones.length > 0 && (() => {
            const mp = milestoneProgress(goal);
            const done = goal.doneMilestones ?? [];
            return (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest mb-1.5 flex items-center gap-2" style={{ color: "var(--text-tertiary)" }}>
                  Milestones
                  <span className="font-mono" style={{ color: mp.done === mp.total ? "var(--accent)" : "var(--text-tertiary)" }}>{mp.done}/{mp.total}</span>
                </p>
                <ul className="space-y-1 text-sm">
                  {goal.milestones.map((m, i) => {
                    const isDone = done.includes(m);
                    return (
                      <li key={i} className="flex items-start gap-2 group">
                        <button
                          onClick={() => toggleMilestone(goal.id, m)}
                          aria-label={isDone ? "Mark milestone not done" : "Mark milestone done"}
                          className="shrink-0 mt-0.5 h-4 w-4 rounded-[5px] border flex items-center justify-center transition-transform duration-150 active:scale-[0.85]"
                          style={{
                            borderColor: isDone ? "var(--accent)" : "var(--border)",
                            background: isDone ? "var(--accent)" : "transparent",
                          }}>
                          {isDone && <Check size={11} className="text-white" />}
                        </button>
                        <span className="flex-1" style={{ color: "var(--text-secondary)", textDecoration: isDone ? "line-through" : "none", opacity: isDone ? 0.55 : 1 }}>{m}</span>
                        {!isDone && (
                          <button
                            onClick={() => { addCommitment(goal.id, m); toast("Added to this week"); }}
                            title="Make this week's commitment"
                            className="shrink-0 flex items-center gap-0.5 text-[10px] font-medium opacity-0 group-hover:opacity-100 transition-transform duration-150 active:scale-[0.9]"
                            style={{ color: "var(--accent)" }}>
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
            <button onClick={() => { logSession(goal.id); toast("Session logged"); }}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium bg-sage-400 text-white hover:bg-sage-500 transition-[background,transform] duration-150 active:scale-[0.97]">
              <Check size={13} /> Log session
            </button>
            <DraftButton />
            {goal.status === "active" ? (
              <button onClick={() => updateGoal(goal.id, { status: "done" })} className="text-xs font-medium transition-transform duration-150 active:scale-[0.97]" style={{ color: "var(--text-tertiary)" }}>
                Mark done
              </button>
            ) : (
              <button onClick={() => updateGoal(goal.id, { status: "active" })} className="text-xs font-medium transition-transform duration-150 active:scale-[0.97]" style={{ color: "var(--text-tertiary)" }}>
                Reactivate
              </button>
            )}
            <button onClick={() => deleteGoal(goal.id)} aria-label="Delete goal" title="Delete" className="ml-auto p-1.5 rounded-lg transition-transform duration-150 active:scale-[0.9]" style={{ color: "var(--text-tertiary)" }}>
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Page ---

export default function GoalsPage() {
  const { goals, loading, createGoal } = useGoals();
  const { toast } = useToast();
  const [creating, setCreating] = useState(false);

  const thisQuarter = quarterOf();
  const week = mondayOf();
  const current = goals.filter((g) => g.quarter === thisQuarter);
  const others = goals.filter((g) => g.quarter !== thisQuarter);

  // Surface goals that need a decision first.
  const byAttention = (a: Goal, b: Goal) => {
    const rank = (g: Goal) => (g.status === "active" ? STATE_RANK[goalPlanState(g, week)] : 9);
    return rank(a) - rank(b);
  };
  const currentSorted = [...current].sort(byAttention);

  // Week-at-a-glance across this quarter's active goals.
  const activeCurrent = current.filter((g) => g.status === "active");
  const weekTotal = activeCurrent.reduce((n, g) => n + commitmentsForWeek(g, week).length, 0);
  const weekDone = activeCurrent.reduce((n, g) => n + commitmentsForWeek(g, week).filter((c) => c.done).length, 0);
  const needsPlan = activeCurrent.filter((g) => goalPlanState(g, week) === "unplanned").length;

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-center justify-between gap-4 flex-wrap enter">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
            <Flag size={22} style={{ color: "var(--accent)" }} /> Goals
          </h1>
          <p className="text-xs mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5" style={{ color: "var(--text-tertiary)" }}>
            <span>{thisQuarter} · quarterly objectives, followed week to week.</span>
            {activeCurrent.length > 0 && (
              <span className="font-mono" style={{ color: "var(--text-secondary)" }}>
                {weekDone}/{weekTotal} committed this week
                {needsPlan > 0 && <span style={{ color: "#F59E0B" }}> · {needsPlan} need{needsPlan === 1 ? "s" : ""} a plan</span>}
              </span>
            )}
          </p>
        </div>
        {!creating && (
          <button onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium bg-sage-400 text-white hover:bg-sage-500 transition-[background,transform] duration-150 active:scale-[0.97]">
            <Plus size={15} /> New goal
          </button>
        )}
      </div>

      {creating && (
        <GoalEditor onCancel={() => setCreating(false)}
          onSave={(data) => { createGoal(data); setCreating(false); toast("Goal created"); }} />
      )}

      {goals.length === 0 && !loading && !creating && (
        <div className="flex flex-col items-center justify-center py-16 rounded-xl text-center enter"
          style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}>
          <Flag size={40} style={{ color: "var(--text-tertiary)" }} className="mb-4" />
          <p className="text-lg font-medium" style={{ color: "var(--text-primary)" }}>No goals this quarter</p>
          <p className="text-sm mt-1 max-w-xs" style={{ color: "var(--text-secondary)" }}>
            Name a vague ambition — a workout plan, a syllabus — then let Claude turn it into milestones and a first week.
          </p>
          <button onClick={() => setCreating(true)}
            className="mt-4 flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium bg-sage-400 text-white hover:bg-sage-500 transition-[background,transform] duration-150 active:scale-[0.97]">
            <Plus size={15} /> Set your first goal
          </button>
        </div>
      )}

      {currentSorted.length > 0 && (
        <div className="space-y-2">
          {currentSorted.map((g, i) => <GoalCard key={g.id} goal={g} delay={Math.min(i * 40, 200)} />)}
        </div>
      )}

      {others.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--text-secondary)" }}>Other quarters</p>
          {others.map((g, i) => <GoalCard key={g.id} goal={g} delay={Math.min(i * 40, 200)} />)}
        </div>
      )}
    </div>
  );
}

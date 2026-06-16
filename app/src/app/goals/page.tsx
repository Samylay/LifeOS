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
  ChevronUp,
  Circle,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { useGoals } from "@/lib/use-goals";
import { useToast } from "@/components/toast";
import {
  quarterOf,
  mondayOf,
  commitmentsForWeek,
  sessionsThisWeekForGoal,
  type Goal,
} from "@/lib/types";

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
    <div className="rounded-xl p-4 space-y-3" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}>
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
        <button onClick={onCancel} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium"
          style={{ color: "var(--text-secondary)", background: "var(--bg-tertiary)" }}>
          <X size={14} /> Cancel
        </button>
        <button onClick={() => title.trim() && onSave({ title: title.trim(), quarter: quarter.trim() || quarterOf(), why: why.trim() || undefined, outcome: outcome.trim() || undefined })}
          disabled={!title.trim()}
          className="flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium bg-sage-400 text-white hover:bg-sage-500 transition-colors disabled:opacity-50">
          <Check size={14} /> Create
        </button>
      </div>
    </div>
  );
}

// --- Goal card ---

function GoalCard({ goal }: { goal: Goal }) {
  const { updateGoal, deleteGoal, addCommitment, toggleCommitment, removeCommitment, logSession, draftPlan } = useGoals();
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [newCommit, setNewCommit] = useState("");
  const [drafting, setDrafting] = useState(false);

  const week = mondayOf();
  const weekCommits = commitmentsForWeek(goal, week);
  const doneCount = weekCommits.filter((c) => c.done).length;
  const sessions = sessionsThisWeekForGoal(goal, week);

  return (
    <div className="rounded-xl p-4" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}>
      <div className="flex items-start gap-3">
        <button onClick={() => setExpanded((e) => !e)} className="flex-1 text-left min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-md" style={{ background: "var(--accent-bg)", color: "var(--accent)" }}>
              {goal.quarter}
            </span>
            {goal.status !== "active" && (
              <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>{goal.status}</span>
            )}
          </div>
          <p className="text-sm font-medium mt-1 truncate" style={{ color: "var(--text-primary)" }}>{goal.title}</p>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>
            This week: {doneCount}/{weekCommits.length} commitments · {sessions} session{sessions === 1 ? "" : "s"}
          </p>
        </button>
        <button onClick={() => setExpanded((e) => !e)} className="shrink-0 p-1.5 rounded-lg" style={{ color: "var(--text-tertiary)" }}>
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>

      {expanded && (
        <div className="mt-3 pt-3 space-y-4" style={{ borderTop: "1px solid var(--border-primary)" }}>
          {goal.outcome && (
            <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
              <span className="font-semibold" style={{ color: "var(--text-tertiary)" }}>Done when: </span>{goal.outcome}
            </p>
          )}

          {/* This week */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: "var(--text-tertiary)" }}>This week</p>
            <div className="space-y-1">
              {weekCommits.map((c) => (
                <div key={c.id} className="flex items-center gap-2 group">
                  <button onClick={() => toggleCommitment(goal.id, c.id)} className="shrink-0" style={{ color: c.done ? "var(--accent)" : "var(--text-tertiary)" }}>
                    {c.done ? <CheckCircle2 size={16} /> : <Circle size={16} />}
                  </button>
                  <span className="text-sm flex-1" style={{ color: "var(--text-primary)", textDecoration: c.done ? "line-through" : "none", opacity: c.done ? 0.6 : 1 }}>
                    {c.text}
                  </span>
                  <button onClick={() => removeCommitment(goal.id, c.id)} className="shrink-0 opacity-0 group-hover:opacity-100" style={{ color: "var(--text-tertiary)" }}>
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
                className="shrink-0 p-1.5 rounded-lg" style={{ color: "var(--accent)" }}>
                <Plus size={15} />
              </button>
            </div>
          </div>

          {/* Milestones */}
          {goal.milestones.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: "var(--text-tertiary)" }}>Milestones</p>
              <ol className="space-y-1 list-decimal list-inside text-sm" style={{ color: "var(--text-secondary)" }}>
                {goal.milestones.map((m, i) => <li key={i}>{m}</li>)}
              </ol>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => { logSession(goal.id); toast("Session logged"); }}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium bg-sage-400 text-white hover:bg-sage-500 transition-colors">
              <Check size={13} /> Log session
            </button>
            <button onClick={async () => {
                setDrafting(true);
                try { const r = await draftPlan(goal.id); toast(r ? `Claude added ${r.added} commitment${r.added === 1 ? "" : "s"}` : "No draft"); }
                catch (e) { toast(e instanceof Error ? e.message : "Draft failed"); }
                finally { setDrafting(false); }
              }}
              disabled={drafting}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50"
              style={{ color: "var(--accent)", background: "var(--accent-bg)" }}>
              {drafting ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
              {drafting ? "Drafting…" : "Draft with Claude"}
            </button>
            {goal.status === "active" ? (
              <button onClick={() => updateGoal(goal.id, { status: "done" })} className="text-xs font-medium" style={{ color: "var(--text-tertiary)" }}>
                Mark done
              </button>
            ) : (
              <button onClick={() => updateGoal(goal.id, { status: "active" })} className="text-xs font-medium" style={{ color: "var(--text-tertiary)" }}>
                Reactivate
              </button>
            )}
            <button onClick={() => deleteGoal(goal.id)} title="Delete" className="ml-auto p-1.5 rounded-lg" style={{ color: "var(--text-tertiary)" }}>
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
  const current = goals.filter((g) => g.quarter === thisQuarter);
  const others = goals.filter((g) => g.quarter !== thisQuarter);

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
            <Flag size={22} style={{ color: "var(--accent)" }} /> Goals
          </h1>
          <p className="text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>
            Quarterly objectives, followed week to week. {thisQuarter}.
          </p>
        </div>
        {!creating && (
          <button onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium bg-sage-400 text-white hover:bg-sage-500 transition-colors">
            <Plus size={15} /> New goal
          </button>
        )}
      </div>

      {creating && (
        <GoalEditor onCancel={() => setCreating(false)}
          onSave={(data) => { createGoal(data); setCreating(false); toast("Goal created"); }} />
      )}

      {goals.length === 0 && !loading && !creating && (
        <div className="flex flex-col items-center justify-center py-16 rounded-xl text-center"
          style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}>
          <Flag size={48} style={{ color: "var(--text-tertiary)" }} className="mb-4" />
          <p className="text-lg font-medium" style={{ color: "var(--text-primary)" }}>No goals this quarter</p>
          <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
            Set a quarterly objective, then let Claude draft the weekly plan.
          </p>
        </div>
      )}

      {current.length > 0 && (
        <div className="space-y-2">
          {current.map((g) => <GoalCard key={g.id} goal={g} />)}
        </div>
      )}

      {others.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--text-secondary)" }}>Other quarters</p>
          {others.map((g) => <GoalCard key={g.id} goal={g} />)}
        </div>
      )}
    </div>
  );
}

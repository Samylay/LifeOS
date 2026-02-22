"use client";

import { useState } from "react";
import { Flag, Plus, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import { useGoals } from "@/lib/use-goals";
import type { Goal } from "@/lib/types";

const QUARTERS = [1, 2, 3, 4] as const;
const STATUS_COLORS = {
  active: "#7C9E8A",
  completed: "#6366F1",
  abandoned: "#64748B",
};

function GoalCreateForm({ year, onSubmit, onCancel }: {
  year: number;
  onSubmit: (data: Omit<Goal, "id">) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [quarter, setQuarter] = useState<1 | 2 | 3 | 4 | undefined>(undefined);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSubmit({
      title: title.trim(),
      year,
      quarter,
      status: "active",
      linkedProjectIds: [],
    });
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-xl p-5 space-y-4" style={{ background: "var(--bg-secondary)", border: "1px solid var(--accent)" }}>
      <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Goal title..."
        autoFocus className="w-full bg-transparent text-sm font-medium outline-none" style={{ color: "var(--text-primary)" }} />
      <div className="flex items-center gap-3">
        <div>
          <label className="text-xs block mb-1" style={{ color: "var(--text-tertiary)" }}>Quarter (optional)</label>
          <select value={quarter ?? ""} onChange={(e) => setQuarter(e.target.value ? parseInt(e.target.value) as 1 | 2 | 3 | 4 : undefined)}
            className="text-xs rounded-lg px-2 py-1.5 outline-none"
            style={{ background: "var(--bg-tertiary)", color: "var(--text-primary)", border: "1px solid var(--border-primary)" }}>
            <option value="">Annual</option>
            <option value="1">Q1 (Jan-Mar)</option>
            <option value="2">Q2 (Apr-Jun)</option>
            <option value="3">Q3 (Jul-Sep)</option>
            <option value="4">Q4 (Oct-Dec)</option>
          </select>
        </div>
        <div className="flex-1" />
        <button type="button" onClick={onCancel} className="text-xs px-3 py-1.5 rounded-lg" style={{ color: "var(--text-secondary)" }}>Cancel</button>
        <button type="submit" className="text-xs px-4 py-1.5 rounded-lg bg-sage-400 text-white hover:bg-sage-500 transition-colors font-medium">
          Add Goal
        </button>
      </div>
    </form>
  );
}

function GoalCard({ goal, onUpdate, onDelete }: {
  goal: Goal;
  onUpdate: (id: string, data: Partial<Goal>) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="rounded-xl p-4 group transition-all" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{goal.title}</h3>
          <div className="flex items-center gap-2 mt-1.5">
            <button onClick={() => {
              const next: Record<string, Goal["status"]> = { active: "completed", completed: "abandoned", abandoned: "active" };
              onUpdate(goal.id, { status: next[goal.status] });
            }}
              className="text-xs px-2 py-0.5 rounded-full capitalize cursor-pointer transition-colors"
              style={{ background: `${STATUS_COLORS[goal.status]}20`, color: STATUS_COLORS[goal.status] }}>
              {goal.status}
            </button>
            {goal.quarter && (
              <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>Q{goal.quarter}</span>
            )}
          </div>
        </div>
        <button onClick={() => onDelete(goal.id)}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-1" style={{ color: "var(--text-tertiary)" }}>
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

export default function GoalsPage() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const { goals, loading, createGoal, updateGoal, deleteGoal } = useGoals(year);
  const [showForm, setShowForm] = useState(false);

  const annualGoals = goals.filter((g) => !g.quarter);
  const quarterGoals = (q: 1 | 2 | 3 | 4) => goals.filter((g) => g.quarter === q);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>Goals</h1>
          <div className="flex items-center gap-1 rounded-lg px-1" style={{ background: "var(--bg-tertiary)" }}>
            <button onClick={() => setYear(year - 1)} className="p-1 rounded" style={{ color: "var(--text-tertiary)" }}><ChevronLeft size={16} /></button>
            <span className="text-sm font-mono font-semibold px-2" style={{ color: "var(--text-primary)" }}>{year}</span>
            <button onClick={() => setYear(year + 1)} className="p-1 rounded" style={{ color: "var(--text-tertiary)" }}><ChevronRight size={16} /></button>
          </div>
        </div>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium bg-sage-400 text-white hover:bg-sage-500 transition-colors">
          <Plus size={16} /> Add Goal
        </button>
      </div>

      {showForm && (
        <div className="mb-6">
          <GoalCreateForm year={year} onSubmit={(data) => { createGoal(data); setShowForm(false); }} onCancel={() => setShowForm(false)} />
        </div>
      )}

      {goals.length === 0 && !showForm ? (
        <div className="flex flex-col items-center justify-center py-16 rounded-xl"
          style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}>
          <Flag size={48} style={{ color: "var(--text-tertiary)" }} className="mb-4" />
          <p className="text-lg font-medium" style={{ color: "var(--text-primary)" }}>No goals set yet</p>
          <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>Define your annual goals with quarterly milestones.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {annualGoals.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--accent)" }}>Annual Goals</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {annualGoals.map((g) => <GoalCard key={g.id} goal={g} onUpdate={updateGoal} onDelete={deleteGoal} />)}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {QUARTERS.map((q) => {
              const qGoals = quarterGoals(q);
              return (
                <div key={q}>
                  <h2 className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-secondary)" }}>
                    Q{q}
                    <span className="ml-1 text-xs font-normal" style={{ color: "var(--text-tertiary)" }}>
                      {q === 1 ? "Jan-Mar" : q === 2 ? "Apr-Jun" : q === 3 ? "Jul-Sep" : "Oct-Dec"}
                    </span>
                  </h2>
                  <div className="space-y-3">
                    {qGoals.map((g) => <GoalCard key={g.id} goal={g} onUpdate={updateGoal} onDelete={deleteGoal} />)}
                    {qGoals.length === 0 && (
                      <div className="rounded-lg py-8 text-center" style={{ border: "1px dashed var(--border-primary)" }}>
                        <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>No goals</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

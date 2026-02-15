"use client";

import { useState } from "react";
import { Target, Plus, Trash2 } from "lucide-react";
import { useQuests } from "@/lib/use-quests";
import type { Quest, QuestCategory } from "@/lib/types";

function QuestCreateForm({ onSubmit, onCancel }: {
  onSubmit: (data: Omit<Quest, "id">) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<QuestCategory>("life");
  const [criteria, setCriteria] = useState("");

  const now = new Date();
  const endDate = new Date(now);
  endDate.setDate(endDate.getDate() + 90);

  const [startStr, setStartStr] = useState(now.toISOString().split("T")[0]);
  const [endStr, setEndStr] = useState(endDate.toISOString().split("T")[0]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSubmit({
      title: title.trim(),
      category,
      criteria: criteria.trim() || "Complete this quest",
      progress: 0,
      startDate: new Date(startStr),
      endDate: new Date(endStr),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-xl p-5 space-y-4" style={{ background: "var(--bg-secondary)", border: "1px solid var(--accent)" }}>
      <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Quest title..."
        autoFocus className="w-full bg-transparent text-sm font-medium outline-none" style={{ color: "var(--text-primary)" }} />
      <input type="text" value={criteria} onChange={(e) => setCriteria(e.target.value)} placeholder="Success criteria (what does done look like?)..."
        className="w-full bg-transparent text-xs outline-none" style={{ color: "var(--text-secondary)" }} />
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="text-xs block mb-1" style={{ color: "var(--text-tertiary)" }}>Category</label>
          <select value={category} onChange={(e) => setCategory(e.target.value as QuestCategory)}
            className="w-full text-xs rounded-lg px-2 py-1.5 outline-none"
            style={{ background: "var(--bg-tertiary)", color: "var(--text-primary)", border: "1px solid var(--border-primary)" }}>
            <option value="life">Life</option>
            <option value="work">Work</option>
          </select>
        </div>
        <div>
          <label className="text-xs block mb-1" style={{ color: "var(--text-tertiary)" }}>Start</label>
          <input type="date" value={startStr} onChange={(e) => setStartStr(e.target.value)}
            className="w-full text-xs rounded-lg px-2 py-1.5 outline-none"
            style={{ background: "var(--bg-tertiary)", color: "var(--text-primary)", border: "1px solid var(--border-primary)" }} />
        </div>
        <div>
          <label className="text-xs block mb-1" style={{ color: "var(--text-tertiary)" }}>End</label>
          <input type="date" value={endStr} onChange={(e) => setEndStr(e.target.value)}
            className="w-full text-xs rounded-lg px-2 py-1.5 outline-none"
            style={{ background: "var(--bg-tertiary)", color: "var(--text-primary)", border: "1px solid var(--border-primary)" }} />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="text-xs px-3 py-1.5 rounded-lg" style={{ color: "var(--text-secondary)" }}>Cancel</button>
        <button type="submit" className="text-xs px-4 py-1.5 rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 transition-colors font-medium">
          Create Quest
        </button>
      </div>
    </form>
  );
}

function QuestCard({ quest, onUpdate, onDelete }: {
  quest: Quest;
  onUpdate: (id: string, data: Partial<Quest>) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const now = new Date();
  const totalDays = Math.ceil((quest.endDate.getTime() - quest.startDate.getTime()) / 86400000);
  const elapsedDays = Math.ceil((now.getTime() - quest.startDate.getTime()) / 86400000);
  const daysLeft = Math.max(0, totalDays - elapsedDays);
  const isExpired = now > quest.endDate;
  const isComplete = quest.progress >= 100;

  return (
    <div className="rounded-xl p-5 group transition-all" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)", opacity: isComplete ? 0.7 : 1 }}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{quest.title}</h3>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs px-1.5 py-0.5 rounded capitalize"
              style={{ background: quest.category === "work" ? "#6366F120" : "#10B98120", color: quest.category === "work" ? "#6366F1" : "#10B981" }}>
              {quest.category}
            </span>
            {isComplete && <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "#10B98120", color: "#10B981" }}>Complete</span>}
            {isExpired && !isComplete && <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "#EF444420", color: "#EF4444" }}>Expired</span>}
          </div>
        </div>
        <button onClick={() => onDelete(quest.id)}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-1" style={{ color: "var(--text-tertiary)" }}>
          <Trash2 size={14} />
        </button>
      </div>

      <p className="text-xs mb-3" style={{ color: "var(--text-secondary)" }}>{quest.criteria}</p>

      <div className="mb-2">
        <div className="flex justify-between mb-1">
          <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>Progress</span>
          <span className="text-xs font-mono font-semibold" style={{ color: "var(--accent)" }}>{quest.progress}%</span>
        </div>
        <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--bg-tertiary)" }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${quest.progress}%`, background: isComplete ? "#10B981" : "var(--accent)" }} />
        </div>
      </div>

      {editing ? (
        <div className="flex items-center gap-2 mt-3">
          <input type="range" min={0} max={100} value={quest.progress}
            onChange={(e) => onUpdate(quest.id, { progress: parseInt(e.target.value) })}
            className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer" style={{ accentColor: "var(--accent)" }} />
          <span className="text-xs font-mono w-8 text-right" style={{ color: "var(--accent)" }}>{quest.progress}%</span>
          <button onClick={() => setEditing(false)} className="text-xs px-2 py-1 rounded" style={{ color: "var(--accent)" }}>Done</button>
        </div>
      ) : (
        <div className="flex items-center justify-between mt-2">
          <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
            {isExpired ? "Ended" : `${daysLeft} days left`}
          </span>
          <button onClick={() => setEditing(true)}
            className="text-xs px-2 py-1 rounded-lg transition-colors" style={{ background: "var(--accent-bg)", color: "var(--accent)" }}>
            Update Progress
          </button>
        </div>
      )}
    </div>
  );
}

export default function QuestsPage() {
  const { quests, loading, createQuest, updateQuest, deleteQuest } = useQuests();
  const [showForm, setShowForm] = useState(false);

  const now = new Date();
  const active = quests.filter((q) => now >= q.startDate && now <= q.endDate && q.progress < 100);
  const completed = quests.filter((q) => q.progress >= 100);
  const expired = quests.filter((q) => now > q.endDate && q.progress < 100);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>Quests</h1>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium bg-emerald-500 text-white hover:bg-emerald-600 transition-colors">
          <Plus size={16} /> New Quest
        </button>
      </div>

      {showForm && (
        <div className="mb-6">
          <QuestCreateForm onSubmit={(data) => { createQuest(data); setShowForm(false); }} onCancel={() => setShowForm(false)} />
        </div>
      )}

      {quests.length === 0 && !showForm ? (
        <div className="flex flex-col items-center justify-center py-16 rounded-xl"
          style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}>
          <Target size={48} style={{ color: "var(--text-tertiary)" }} className="mb-4" />
          <p className="text-lg font-medium" style={{ color: "var(--text-primary)" }}>No quests yet</p>
          <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>Create 90-day quests to stay focused on what matters.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {active.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--accent)" }}>Active ({active.length})</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {active.map((q) => <QuestCard key={q.id} quest={q} onUpdate={updateQuest} onDelete={deleteQuest} />)}
              </div>
            </div>
          )}
          {completed.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: "#10B981" }}>Completed ({completed.length})</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {completed.map((q) => <QuestCard key={q.id} quest={q} onUpdate={updateQuest} onDelete={deleteQuest} />)}
              </div>
            </div>
          )}
          {expired.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-tertiary)" }}>Expired ({expired.length})</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {expired.map((q) => <QuestCard key={q.id} quest={q} onUpdate={updateQuest} onDelete={deleteQuest} />)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

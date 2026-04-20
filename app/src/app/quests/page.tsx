"use client";

import { useState } from "react";
import { Target, Plus, Trash2 } from "lucide-react";
import { useQuests } from "@/lib/use-quests";
import { AREAS, type Quest, type QuestCategory } from "@/lib/types";

const CATEGORIES: { value: QuestCategory; label: string }[] = [
  { value: "life", label: "Life" },
  { value: "work", label: "Work" },
  { value: "health", label: "Health" },
  { value: "career", label: "Career" },
  { value: "finance", label: "Finance" },
  { value: "brand", label: "Brand" },
  { value: "admin", label: "Admin" },
];

const CATEGORY_COLORS: Record<string, string> = {
  life: "#7C9E8A",
  work: "#6366F1",
  health: "#14B8A6",
  career: "#6366F1",
  finance: "#F59E0B",
  brand: "#8B5CF6",
  admin: "#64748B",
};

function CreateForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (data: Parameters<ReturnType<typeof useQuests>["createQuest"]>[0]) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [criteria, setCriteria] = useState("");
  const [category, setCategory] = useState<QuestCategory>("life");
  const today = new Date();
  const ninetyDaysOut = new Date(today.getTime() + 90 * 86400 * 1000);
  const [endDate, setEndDate] = useState(ninetyDaysOut.toISOString().split("T")[0]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSubmit({
      title: title.trim(),
      criteria: criteria.trim(),
      category,
      startDate: today,
      endDate: new Date(endDate),
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl p-4 space-y-3 mb-6"
      style={{ background: "var(--bg-secondary)", border: "1px solid var(--accent)" }}
    >
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Quest title..."
        className="w-full bg-transparent text-sm font-medium outline-none"
        style={{ color: "var(--text-primary)" }}
      />
      <input
        value={criteria}
        onChange={(e) => setCriteria(e.target.value)}
        placeholder="Success criteria (e.g. 12/20 sessions)"
        className="w-full bg-transparent text-xs outline-none"
        style={{ color: "var(--text-secondary)" }}
      />
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as QuestCategory)}
          className="text-xs rounded-lg px-2 py-1.5 outline-none"
          style={{
            background: "var(--bg-tertiary)",
            color: "var(--text-primary)",
            border: "1px solid var(--border-primary)",
          }}
        >
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="text-xs rounded-lg px-2 py-1.5 outline-none"
          style={{
            background: "var(--bg-tertiary)",
            color: "var(--text-primary)",
            border: "1px solid var(--border-primary)",
          }}
        />
        <div className="flex-1" />
        <button
          type="button"
          onClick={onCancel}
          className="text-xs px-3 py-1.5 rounded-lg"
          style={{ color: "var(--text-secondary)" }}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="text-xs px-4 py-1.5 rounded-lg bg-sage-400 text-white hover:bg-sage-500 font-medium"
        >
          Create Quest
        </button>
      </div>
    </form>
  );
}

function QuestCard({
  quest,
  onUpdate,
  onDelete,
}: {
  quest: Quest;
  onUpdate: (id: string, data: Partial<Quest>) => void;
  onDelete: (id: string) => void;
}) {
  const color = CATEGORY_COLORS[quest.category] || "var(--accent)";
  const daysLeft = Math.max(
    0,
    Math.ceil((new Date(quest.endDate).getTime() - Date.now()) / 86400000)
  );

  return (
    <div
      className="rounded-xl p-4 group"
      style={{
        background: "var(--bg-secondary)",
        border: `1px solid ${quest.hot ? "var(--accent)" : "var(--border-primary)"}`,
      }}
    >
      <div className="flex items-start justify-between mb-2">
        <h3 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
          {quest.title}
        </h3>
        <div className="flex items-center gap-1">
          <span
            className="text-xs font-mono px-2 py-0.5 rounded-full uppercase tracking-wider"
            style={{ background: `${color}20`, color }}
          >
            {String(quest.category)}
          </span>
          <button
            onClick={() => onUpdate(quest.id, { hot: !quest.hot })}
            className="text-xs px-1.5 py-0.5 rounded"
            style={{
              color: quest.hot ? "var(--accent)" : "var(--text-tertiary)",
            }}
            title="Toggle hot"
          >
            🔥
          </button>
          <button
            onClick={() => {
              if (confirm(`Delete quest "${quest.title}"?`)) onDelete(quest.id);
            }}
            className="opacity-0 group-hover:opacity-100 p-1"
            style={{ color: "var(--text-tertiary)" }}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <div
        className="h-1.5 rounded-full overflow-hidden mb-1.5"
        style={{ background: "var(--bg-tertiary)" }}
      >
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${Math.min(100, quest.progress)}%`, background: color }}
        />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
          {quest.criteria || "—"}
        </span>
        <span className="text-xs font-mono" style={{ color: "var(--text-tertiary)" }}>
          {quest.progress}%
        </span>
      </div>
      <div className="flex items-center gap-2 mt-2">
        <input
          type="range"
          min="0"
          max="100"
          value={quest.progress}
          onChange={(e) =>
            onUpdate(quest.id, { progress: Math.max(0, Math.min(100, Number(e.target.value))) })
          }
          className="flex-1 accent-sage-400"
        />
        <span className="text-xs font-mono" style={{ color: "var(--text-tertiary)" }}>
          {daysLeft}d left
        </span>
      </div>
    </div>
  );
}

export default function QuestsPage() {
  const { quests, activeQuests, createQuest, updateQuest, deleteQuest } = useQuests();
  const [showForm, setShowForm] = useState(false);

  const completed = quests.filter((q) => q.status === "completed").length;
  const minDaysLeft = activeQuests.length
    ? Math.max(
        0,
        ...activeQuests.map((q) =>
          Math.ceil((new Date(q.endDate).getTime() - Date.now()) / 86400000)
        )
      )
    : 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>
            Quests
          </h1>
          <p
            className="text-xs font-mono uppercase tracking-wider mt-1"
            style={{ color: "var(--text-tertiary)" }}
          >
            {activeQuests.length} active · {completed} completed
            {activeQuests.length > 0 && ` · ${minDaysLeft}d left`}
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium bg-sage-400 text-white hover:bg-sage-500 transition-colors"
        >
          <Plus size={16} /> New Quest
        </button>
      </div>

      {showForm && (
        <CreateForm
          onSubmit={(data) => {
            createQuest(data);
            setShowForm(false);
          }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {quests.length === 0 && !showForm ? (
        <div
          className="flex flex-col items-center justify-center py-16 rounded-xl"
          style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}
        >
          <Target size={48} style={{ color: "var(--text-tertiary)" }} className="mb-4" />
          <p className="text-lg font-medium" style={{ color: "var(--text-primary)" }}>
            No quests yet
          </p>
          <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
            Define a 90-day sprint with clear success criteria.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {activeQuests.map((q) => (
            <QuestCard
              key={q.id}
              quest={q}
              onUpdate={updateQuest}
              onDelete={deleteQuest}
            />
          ))}
        </div>
      )}
    </div>
  );
}

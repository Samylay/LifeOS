"use client";

import { useState, ReactNode } from "react";
import { Plus, Check, X, Flame } from "lucide-react";
import type { Task, AreaId } from "@/lib/types";
import type { HabitWithArea } from "@/lib/use-habits";
import { TaskItem, TaskCreateForm } from "./task-list";

// --- Metric Card ---

interface MetricProps {
  label: string;
  value: string | number;
  color: string;
  suffix?: string;
}

export function MetricCard({ label, value, color, suffix }: MetricProps) {
  return (
    <div className="flex justify-between items-baseline">
      <span className="text-sm" style={{ color: "var(--text-primary)" }}>{label}</span>
      <span className="text-sm font-mono font-semibold" style={{ color }}>
        {value}{suffix && <span className="text-xs font-normal ml-0.5">{suffix}</span>}
      </span>
    </div>
  );
}

// --- Habit List ---

interface HabitListProps {
  habits: HabitWithArea[];
  onToggle: (id: string) => void;
  onCreate: (data: Omit<HabitWithArea, "id">) => void;
  onDelete: (id: string) => void;
  area: AreaId;
}

export function HabitList({ habits, onToggle, onCreate, onDelete, area }: HabitListProps) {
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newFreq, setNewFreq] = useState<"daily" | "weekly">("daily");

  const today = new Date().toISOString().split("T")[0];
  const areaHabits = habits.filter((h) => h.area === area);

  const handleAdd = () => {
    if (!newName.trim()) return;
    onCreate({
      name: newName.trim(),
      frequency: newFreq,
      streak: 0,
      history: [],
      area,
    });
    setNewName("");
    setShowForm(false);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>Habits</h3>
        <button
          onClick={() => setShowForm(!showForm)}
          className="p-1 rounded transition-colors"
          style={{ color: "var(--text-tertiary)" }}
        >
          <Plus size={14} />
        </button>
      </div>

      {showForm && (
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Habit name..."
            className="flex-1 text-xs bg-transparent rounded-lg px-2 py-1.5 outline-none"
            style={{ border: "1px solid var(--border-primary)", color: "var(--text-primary)" }}
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          />
          <select
            value={newFreq}
            onChange={(e) => setNewFreq(e.target.value as "daily" | "weekly")}
            className="text-xs rounded-lg px-2 py-1.5 outline-none"
            style={{ background: "var(--bg-tertiary)", color: "var(--text-primary)", border: "1px solid var(--border-primary)" }}
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </select>
          <button onClick={handleAdd} className="text-xs px-2 py-1.5 rounded-lg bg-emerald-500 text-white">
            Add
          </button>
        </div>
      )}

      {areaHabits.length === 0 && !showForm && (
        <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>No habits configured yet.</p>
      )}

      <div className="space-y-2">
        {areaHabits.map((habit) => {
          const todayDone = habit.history.some((h) => h.date === today && h.completed);
          return (
            <div
              key={habit.id}
              className="group flex items-center gap-3 rounded-lg px-3 py-2"
              style={{ background: "var(--bg-tertiary)" }}
            >
              <button
                onClick={() => onToggle(habit.id)}
                className="shrink-0 h-5 w-5 rounded flex items-center justify-center transition-colors"
                style={{
                  border: todayDone ? "none" : "1.5px solid var(--text-tertiary)",
                  background: todayDone ? "var(--accent)" : "transparent",
                }}
              >
                {todayDone && <Check size={12} className="text-white" />}
              </button>
              <span
                className="flex-1 text-sm"
                style={{
                  color: "var(--text-primary)",
                  textDecoration: todayDone ? "line-through" : "none",
                  opacity: todayDone ? 0.6 : 1,
                }}
              >
                {habit.name}
              </span>
              {habit.streak > 0 && (
                <span className="flex items-center gap-1 text-xs font-mono" style={{ color: "var(--accent)" }}>
                  <Flame size={12} />
                  {habit.streak}
                </span>
              )}
              <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                {habit.frequency}
              </span>
              <button
                onClick={() => onDelete(habit.id)}
                className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-0.5"
                style={{ color: "var(--text-tertiary)" }}
              >
                <X size={12} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --- Quick Notes ---

interface QuickNotesProps {
  notes: { id: string; content: string; createdAt: Date }[];
  onAdd: (content: string) => void;
  onDelete: (id: string) => void;
}

export function QuickNotes({ notes, onAdd, onDelete }: QuickNotesProps) {
  const [input, setInput] = useState("");

  const handleAdd = () => {
    if (!input.trim()) return;
    onAdd(input.trim());
    setInput("");
  };

  return (
    <div>
      <h3 className="text-sm font-medium mb-3" style={{ color: "var(--text-secondary)" }}>Quick Notes</h3>
      <div className="flex gap-2 mb-3">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Add a quick note..."
          className="flex-1 text-xs bg-transparent rounded-lg px-3 py-2 outline-none"
          style={{ border: "1px solid var(--border-primary)", color: "var(--text-primary)" }}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
        />
        <button
          onClick={handleAdd}
          className="px-3 py-2 rounded-lg text-xs font-medium bg-emerald-500 text-white hover:bg-emerald-600 transition-colors"
        >
          Add
        </button>
      </div>
      <div className="space-y-2 max-h-48 overflow-y-auto">
        {notes.length === 0 && (
          <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>No notes yet.</p>
        )}
        {notes.map((note) => (
          <div
            key={note.id}
            className="group flex items-start gap-2 rounded-lg px-3 py-2"
            style={{ background: "var(--bg-tertiary)" }}
          >
            <p className="flex-1 text-xs" style={{ color: "var(--text-primary)" }}>{note.content}</p>
            <button
              onClick={() => onDelete(note.id)}
              className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 mt-0.5"
              style={{ color: "var(--text-tertiary)" }}
            >
              <X size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Area Module Layout ---

interface AreaModuleProps {
  icon: ReactNode;
  title: string;
  color: string;
  areaId: AreaId;
  metrics: MetricProps[];
  children: ReactNode;
  tasks: Task[];
  onTaskUpdate: (id: string, data: Partial<Task>) => void;
  onTaskDelete: (id: string) => void;
  onTaskCreate: (data: Omit<Task, "id" | "createdAt" | "updatedAt">) => void;
  habits: HabitWithArea[];
  onHabitToggle: (id: string) => void;
  onHabitCreate: (data: Omit<HabitWithArea, "id">) => void;
  onHabitDelete: (id: string) => void;
  notes?: { id: string; content: string; createdAt: Date }[];
  onNoteAdd?: (content: string) => void;
  onNoteDelete?: (id: string) => void;
}

export function AreaModule({
  icon,
  title,
  color,
  areaId,
  metrics,
  children,
  tasks,
  onTaskUpdate,
  onTaskDelete,
  onTaskCreate,
  habits,
  onHabitToggle,
  onHabitCreate,
  onHabitDelete,
  notes,
  onNoteAdd,
  onNoteDelete,
}: AreaModuleProps) {
  const [showTaskForm, setShowTaskForm] = useState(false);
  const areaTasks = tasks.filter((t) => t.area === areaId && t.status !== "cancelled");

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div style={{ color }}>{icon}</div>
        <h1 className="text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>
          {title}
        </h1>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Key Metrics */}
        <div
          className="col-span-12 lg:col-span-4 rounded-xl p-6"
          style={{
            background: "var(--bg-secondary)",
            border: "1px solid var(--border-primary)",
            borderLeft: `3px solid ${color}`,
          }}
        >
          <h3 className="text-sm font-medium mb-3" style={{ color: "var(--text-secondary)" }}>Key Metrics</h3>
          <div className="space-y-3">
            {metrics.map((m, i) => (
              <MetricCard key={i} {...m} />
            ))}
            {metrics.length === 0 && (
              <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>No metrics available yet.</p>
            )}
          </div>
        </div>

        {/* Habits */}
        <div
          className="col-span-12 lg:col-span-4 rounded-xl p-6"
          style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}
        >
          <HabitList
            habits={habits}
            onToggle={onHabitToggle}
            onCreate={onHabitCreate}
            onDelete={onHabitDelete}
            area={areaId}
          />
        </div>

        {/* Tasks */}
        <div
          className="col-span-12 lg:col-span-4 rounded-xl p-6"
          style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>Active Tasks</h3>
            <button
              onClick={() => setShowTaskForm(!showTaskForm)}
              className="p-1 rounded transition-colors"
              style={{ color: "var(--text-tertiary)" }}
            >
              <Plus size={14} />
            </button>
          </div>
          {showTaskForm && (
            <div className="mb-3">
              <TaskCreateForm
                onSubmit={(data) => {
                  onTaskCreate({ ...data, area: areaId });
                  setShowTaskForm(false);
                }}
                onCancel={() => setShowTaskForm(false)}
              />
            </div>
          )}
          {areaTasks.length === 0 && !showTaskForm && (
            <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>No tasks yet.</p>
          )}
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {areaTasks.slice(0, 10).map((task) => (
              <TaskItem key={task.id} task={task} onUpdate={onTaskUpdate} onDelete={onTaskDelete} />
            ))}
          </div>
        </div>

        {/* Area-specific content */}
        {children}

        {/* Quick Notes */}
        {notes && onNoteAdd && onNoteDelete && (
          <div
            className="col-span-12 rounded-xl p-6"
            style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}
          >
            <QuickNotes notes={notes} onAdd={onNoteAdd} onDelete={onNoteDelete} />
          </div>
        )}
      </div>
    </div>
  );
}

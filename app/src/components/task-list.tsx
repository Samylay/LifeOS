"use client";

import { useState } from "react";
import { Plus, Check, Circle, Clock, X, ChevronDown, Filter } from "lucide-react";
import type { Task, TaskStatus, TaskPriority, AreaId } from "@/lib/types";
import { AREAS } from "@/lib/types";

interface TaskItemProps {
  task: Task;
  onUpdate: (id: string, data: Partial<Task>) => void;
  onDelete: (id: string) => void;
}

const PRIORITY_COLORS: Record<TaskPriority, string> = {
  urgent: "#EF4444",
  high: "#F59E0B",
  medium: "#3B82F6",
  low: "#94A3B8",
};

const STATUS_ICONS: Record<TaskStatus, typeof Circle> = {
  todo: Circle,
  in_progress: Clock,
  done: Check,
  cancelled: X,
};

export function TaskItem({ task, onUpdate, onDelete }: TaskItemProps) {
  const StatusIcon = STATUS_ICONS[task.status];
  const isDone = task.status === "done" || task.status === "cancelled";

  const cycleStatus = () => {
    const next: Record<TaskStatus, TaskStatus> = {
      todo: "in_progress",
      in_progress: "done",
      done: "todo",
      cancelled: "todo",
    };
    onUpdate(task.id, { status: next[task.status] });
  };

  return (
    <div
      className="group flex items-center gap-3 rounded-lg px-4 py-3 transition-all"
      style={{
        background: "var(--bg-secondary)",
        border: "1px solid var(--border-primary)",
        opacity: isDone ? 0.6 : 1,
      }}
    >
      <button
        onClick={cycleStatus}
        className="shrink-0 rounded-full p-0.5 transition-colors"
        style={{ color: isDone ? "var(--accent)" : "var(--text-tertiary)" }}
      >
        <StatusIcon size={18} fill={isDone ? "var(--accent)" : "none"} />
      </button>

      <div className="flex-1 min-w-0">
        <p
          className="text-sm font-medium truncate"
          style={{
            color: "var(--text-primary)",
            textDecoration: isDone ? "line-through" : "none",
          }}
        >
          {task.title}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          {task.area && (
            <span
              className="text-xs font-medium px-1.5 py-0.5 rounded"
              style={{
                background: `${AREAS[task.area]?.color === "teal" ? "#14B8A6" : AREAS[task.area]?.color === "indigo" ? "#6366F1" : AREAS[task.area]?.color === "amber" ? "#F59E0B" : AREAS[task.area]?.color === "violet" ? "#8B5CF6" : "#64748B"}15`,
                color: AREAS[task.area]?.color === "teal" ? "#14B8A6" : AREAS[task.area]?.color === "indigo" ? "#6366F1" : AREAS[task.area]?.color === "amber" ? "#F59E0B" : AREAS[task.area]?.color === "violet" ? "#8B5CF6" : "#64748B",
              }}
            >
              {AREAS[task.area]?.name}
            </span>
          )}
          {task.dueDate && (
            <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
              {new Date(task.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </span>
          )}
        </div>
      </div>

      <div
        className="h-2 w-2 rounded-full shrink-0"
        style={{ background: PRIORITY_COLORS[task.priority] }}
        title={task.priority}
      />

      <button
        onClick={() => onDelete(task.id)}
        className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity rounded p-1"
        style={{ color: "var(--text-tertiary)" }}
      >
        <X size={14} />
      </button>
    </div>
  );
}

const AREA_COLOR_MAP: Record<string, string> = {
  teal: "#14B8A6",
  indigo: "#6366F1",
  amber: "#F59E0B",
  violet: "#8B5CF6",
  slate: "#64748B",
};

interface TaskCreateFormProps {
  onSubmit: (data: Omit<Task, "id" | "createdAt" | "updatedAt">) => void;
  onCancel: () => void;
}

export function TaskCreateForm({ onSubmit, onCancel }: TaskCreateFormProps) {
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [area, setArea] = useState<AreaId | "">("");
  const [dueDate, setDueDate] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSubmit({
      title: title.trim(),
      priority,
      status: "todo",
      area: area || undefined,
      dueDate: dueDate ? new Date(dueDate) : undefined,
    });
    setTitle("");
    setPriority("medium");
    setArea("");
    setDueDate("");
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl p-4 space-y-3"
      style={{
        background: "var(--bg-secondary)",
        border: "1px solid var(--accent)",
      }}
    >
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Task title..."
        autoFocus
        className="w-full bg-transparent text-sm font-medium outline-none"
        style={{ color: "var(--text-primary)" }}
      />

      <div className="flex flex-wrap items-center gap-2">
        {/* Priority */}
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value as TaskPriority)}
          className="text-xs rounded-lg px-2 py-1.5 outline-none"
          style={{
            background: "var(--bg-tertiary)",
            color: "var(--text-primary)",
            border: "1px solid var(--border-primary)",
          }}
        >
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="urgent">Urgent</option>
        </select>

        {/* Area */}
        <select
          value={area}
          onChange={(e) => setArea(e.target.value as AreaId | "")}
          className="text-xs rounded-lg px-2 py-1.5 outline-none"
          style={{
            background: "var(--bg-tertiary)",
            color: "var(--text-primary)",
            border: "1px solid var(--border-primary)",
          }}
        >
          <option value="">No area</option>
          {Object.entries(AREAS).map(([id, a]) => (
            <option key={id} value={id}>{a.name}</option>
          ))}
        </select>

        {/* Due date */}
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
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
          className="text-xs px-3 py-1.5 rounded-lg transition-colors"
          style={{ color: "var(--text-secondary)" }}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="text-xs px-3 py-1.5 rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 transition-colors font-medium"
        >
          Add Task
        </button>
      </div>
    </form>
  );
}

interface TaskListProps {
  tasks: Task[];
  onUpdate: (id: string, data: Partial<Task>) => void;
  onDelete: (id: string) => void;
  onCreate: (data: Omit<Task, "id" | "createdAt" | "updatedAt">) => void;
  title?: string;
  showFilters?: boolean;
}

export function TaskList({ tasks, onUpdate, onDelete, onCreate, title = "Tasks", showFilters = true }: TaskListProps) {
  const [showForm, setShowForm] = useState(false);
  const [filterStatus, setFilterStatus] = useState<TaskStatus | "all">("all");
  const [filterArea, setFilterArea] = useState<AreaId | "all">("all");

  const filtered = tasks.filter((t) => {
    if (filterStatus !== "all" && t.status !== filterStatus) return false;
    if (filterArea !== "all" && t.area !== filterArea) return false;
    return true;
  });

  // Sort: in_progress first, then todo, then done/cancelled. Within each group, urgent > high > medium > low
  const priorityOrder: Record<TaskPriority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
  const statusOrder: Record<TaskStatus, number> = { in_progress: 0, todo: 1, done: 2, cancelled: 3 };

  const sorted = [...filtered].sort((a, b) => {
    const statusDiff = statusOrder[a.status] - statusOrder[b.status];
    if (statusDiff !== 0) return statusDiff;
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
          {title}
        </h2>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium bg-emerald-500 text-white hover:bg-emerald-600 transition-colors"
        >
          <Plus size={14} />
          Add Task
        </button>
      </div>

      {showFilters && (
        <div className="flex gap-2 mb-3">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as TaskStatus | "all")}
            className="text-xs rounded-lg px-2 py-1.5 outline-none"
            style={{
              background: "var(--bg-tertiary)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-primary)",
            }}
          >
            <option value="all">All statuses</option>
            <option value="todo">To Do</option>
            <option value="in_progress">In Progress</option>
            <option value="done">Done</option>
          </select>
          <select
            value={filterArea}
            onChange={(e) => setFilterArea(e.target.value as AreaId | "all")}
            className="text-xs rounded-lg px-2 py-1.5 outline-none"
            style={{
              background: "var(--bg-tertiary)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-primary)",
            }}
          >
            <option value="all">All areas</option>
            {Object.entries(AREAS).map(([id, a]) => (
              <option key={id} value={id}>{a.name}</option>
            ))}
          </select>
        </div>
      )}

      {showForm && (
        <div className="mb-3">
          <TaskCreateForm
            onSubmit={(data) => {
              onCreate(data);
              setShowForm(false);
            }}
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}

      <div className="space-y-2">
        {sorted.length === 0 && (
          <p className="text-sm py-6 text-center" style={{ color: "var(--text-tertiary)" }}>
            No tasks yet. Click &quot;Add Task&quot; to get started.
          </p>
        )}
        {sorted.map((task) => (
          <TaskItem key={task.id} task={task} onUpdate={onUpdate} onDelete={onDelete} />
        ))}
      </div>
    </div>
  );
}

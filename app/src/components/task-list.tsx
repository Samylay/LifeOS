"use client";

import { useState } from "react";
import { Plus, Check, Circle, Clock, X, Flame } from "lucide-react";
import type { Task, TaskStatus, TaskPriority, AreaId } from "@/lib/types";
import { AREAS } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface TaskItemProps {
  task: Task;
  onUpdate: (id: string, data: Partial<Task>) => void;
  onDelete: (id: string) => void;
}

// Priority/area/status colors are semantic signal, not chrome — kept as raw
// hex per the house style (STYLE.md: "keep area/tier color usage as-is").
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

const AREA_COLOR_MAP: Record<string, string> = {
  teal: "#14B8A6",
  indigo: "#6366F1",
  amber: "#F59E0B",
  violet: "#8B5CF6",
  slate: "#64748B",
};

export function TaskItem({ task, onUpdate, onDelete }: TaskItemProps) {
  const StatusIcon = STATUS_ICONS[task.status];
  const isDone = task.status === "done" || task.status === "cancelled";
  const areaColor = task.area ? AREA_COLOR_MAP[AREAS[task.area]?.color ?? ""] ?? "#64748B" : undefined;

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
      className={cn(
        "group flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 transition-[background,border-color]",
        isDone && "opacity-60"
      )}
    >
      <button
        onClick={cycleStatus}
        aria-label="Cycle task status"
        className={cn(
          "shrink-0 rounded-full p-0.5 transition-transform duration-150 active:scale-[0.9]",
          isDone ? "text-primary" : "text-muted-foreground/70"
        )}
      >
        <StatusIcon size={18} fill={isDone ? "currentColor" : "none"} />
      </button>

      <div className="flex-1 min-w-0">
        <p className={cn("text-sm font-medium truncate text-foreground", isDone && "line-through")}>
          {task.title}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          {task.area && (
            <span
              className="text-xs font-medium px-1.5 py-0.5 rounded"
              style={{ background: `${areaColor}15`, color: areaColor }}
            >
              {AREAS[task.area]?.name}
            </span>
          )}
          {task.energy && (
            <span className="flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border">
              <Flame size={8} className={task.energy >= 1 ? "text-amber-500" : ""} fill={task.energy >= 1 ? "currentColor" : "none"} />
              <Flame size={8} className={task.energy >= 2 ? "text-amber-500" : ""} fill={task.energy >= 2 ? "currentColor" : "none"} />
              <Flame size={8} className={task.energy >= 3 ? "text-amber-500" : ""} fill={task.energy >= 3 ? "currentColor" : "none"} />
            </span>
          )}
          {task.dueDate && (
            <span className="text-xs text-muted-foreground/70">
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
        className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity rounded p-1 text-muted-foreground/70"
      >
        <X size={14} />
      </button>
    </div>
  );
}

interface TaskCreateFormProps {
  onSubmit: (data: Omit<Task, "id" | "createdAt" | "updatedAt">) => void;
  onCancel: () => void;
}

export function TaskCreateForm({ onSubmit, onCancel }: TaskCreateFormProps) {
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [energy, setEnergy] = useState<number>(2);
  const [area, setArea] = useState<AreaId | "">("");
  const [dueDate, setDueDate] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSubmit({
      title: title.trim(),
      priority,
      status: "todo",
      energy: energy as 1 | 2 | 3,
      area: area || undefined,
      dueDate: dueDate ? new Date(dueDate) : undefined,
    });
    setTitle("");
    setPriority("medium");
    setEnergy(2);
    setArea("");
    setDueDate("");
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-border bg-card p-4 space-y-3">
      <Input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Task title..."
        autoFocus
        className="border-none bg-transparent px-0 h-auto py-0 text-sm font-medium shadow-none focus-visible:ring-0"
      />

      <div className="flex flex-wrap items-center gap-2">
        {/* Priority */}
        <Select value={priority} onValueChange={(v) => setPriority(v as TaskPriority)}>
          <SelectTrigger size="sm" className="text-xs h-8 bg-muted">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="low">Low Priority</SelectItem>
            <SelectItem value="medium">Medium Priority</SelectItem>
            <SelectItem value="high">High Priority</SelectItem>
            <SelectItem value="urgent">Urgent</SelectItem>
          </SelectContent>
        </Select>

        {/* Energy */}
        <Select value={String(energy)} onValueChange={(v) => setEnergy(parseInt(v))}>
          <SelectTrigger size="sm" className="text-xs h-8 bg-muted">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">Low Energy</SelectItem>
            <SelectItem value="2">Medium Energy</SelectItem>
            <SelectItem value="3">High Energy</SelectItem>
          </SelectContent>
        </Select>

        {/* Area */}
        <Select value={area || "__none"} onValueChange={(v) => setArea(v === "__none" ? "" : (v as AreaId))}>
          <SelectTrigger size="sm" className="text-xs h-8 bg-muted">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none">No area</SelectItem>
            {Object.entries(AREAS).map(([id, a]) => (
              <SelectItem key={id} value={id}>{a.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Due date */}
        <Input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="text-xs h-8 w-auto bg-muted"
        />

        <div className="flex-1" />

        <Button type="button" variant="ghost" size="sm" onClick={onCancel} className="text-xs text-muted-foreground">
          Cancel
        </Button>
        <Button type="submit" size="sm" className="text-xs">
          Add Task
        </Button>
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
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        <Button size="sm" onClick={() => setShowForm(true)} className="text-xs gap-1.5">
          <Plus size={14} />
          Add Task
        </Button>
      </div>

      {showFilters && (
        <div className="flex gap-2 mb-3">
          <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as TaskStatus | "all")}>
            <SelectTrigger size="sm" className="text-xs h-8 bg-muted">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="todo">To Do</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="done">Done</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterArea} onValueChange={(v) => setFilterArea(v as AreaId | "all")}>
            <SelectTrigger size="sm" className="text-xs h-8 bg-muted">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All areas</SelectItem>
              {Object.entries(AREAS).map(([id, a]) => (
                <SelectItem key={id} value={id}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
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
          <p className="text-sm py-6 text-center text-muted-foreground/70">
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

"use client";

import { useEffect, useRef } from "react";
import {
  Trash2,
  CheckCircle,
  Play,
  XCircle,
  RotateCcw,
  ArrowUp,
  Tag,
  Plus,
  Mic,
  X,
} from "lucide-react";
import type { Task, TaskPriority, AreaId } from "@/lib/types";
import type { CommandAction, ParsedCommand } from "@/lib/command-parser";
import { AREAS } from "@/lib/types";

const ACTION_CONFIG: Record<
  CommandAction,
  {
    icon: typeof Trash2;
    color: string;
    bgColor: string;
    borderColor: string;
    label: string;
  }
> = {
  delete: {
    icon: Trash2,
    color: "#EF4444",
    bgColor: "#EF444412",
    borderColor: "#EF444440",
    label: "Delete",
  },
  complete: {
    icon: CheckCircle,
    color: "#10B981",
    bgColor: "#10B98112",
    borderColor: "#10B98140",
    label: "Complete",
  },
  start: {
    icon: Play,
    color: "#3B82F6",
    bgColor: "#3B82F612",
    borderColor: "#3B82F640",
    label: "Start",
  },
  cancel: {
    icon: XCircle,
    color: "#F59E0B",
    bgColor: "#F59E0B12",
    borderColor: "#F59E0B40",
    label: "Cancel",
  },
  reopen: {
    icon: RotateCcw,
    color: "#8B5CF6",
    bgColor: "#8B5CF612",
    borderColor: "#8B5CF640",
    label: "Reopen",
  },
  set_priority: {
    icon: ArrowUp,
    color: "#F59E0B",
    bgColor: "#F59E0B12",
    borderColor: "#F59E0B40",
    label: "Change Priority",
  },
  set_area: {
    icon: Tag,
    color: "#6366F1",
    bgColor: "#6366F112",
    borderColor: "#6366F140",
    label: "Recategorize",
  },
  create: {
    icon: Plus,
    color: "#10B981",
    bgColor: "#10B98112",
    borderColor: "#10B98140",
    label: "Create",
  },
};

const AREA_COLOR_MAP: Record<string, string> = {
  teal: "#14B8A6",
  indigo: "#6366F1",
  amber: "#F59E0B",
  violet: "#8B5CF6",
  slate: "#64748B",
};

interface ChangePreviewProps {
  command: ParsedCommand;
  tasks: Task[];
  onConfirm: () => void;
  onCancel: () => void;
}

export function ChangePreview({
  command,
  tasks,
  onConfirm,
  onCancel,
}: ChangePreviewProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const config = ACTION_CONFIG[command.action];
  const Icon = config.icon;

  const matchedTasks = tasks.filter((t) =>
    command.matchedTaskIds.includes(t.id)
  );

  useEffect(() => {
    cancelRef.current?.focus();
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
      if (e.key === "Enter") onConfirm();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onCancel, onConfirm]);

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ background: "rgba(0, 0, 0, 0.5)", zIndex: 60 }}
      onClick={onCancel}
    >
      <div
        className="rounded-xl w-full max-w-lg mx-4 overflow-hidden"
        style={{
          background: "var(--bg-secondary)",
          border: `1px solid ${config.borderColor}`,
          boxShadow: "var(--shadow-lg)",
          animation: "changePreviewIn 200ms ease-out",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center gap-3 px-5 py-4"
          style={{
            background: config.bgColor,
            borderBottom: `1px solid ${config.borderColor}`,
          }}
        >
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
            style={{ background: `${config.color}20` }}
          >
            <Icon size={18} style={{ color: config.color }} />
          </div>
          <div className="flex-1 min-w-0">
            <h3
              className="text-sm font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              {config.label}{" "}
              {command.action !== "create" &&
                `${matchedTasks.length} task${matchedTasks.length !== 1 ? "s" : ""}`}
              {command.action === "create" && "new task"}
            </h3>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
              <Mic size={10} className="inline mr-1" style={{ opacity: 0.6 }} />
              {command.description}
            </p>
          </div>
          <button
            onClick={onCancel}
            className="shrink-0 rounded-lg p-1.5 transition-colors"
            style={{ color: "var(--text-tertiary)" }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Task preview list */}
        <div className="px-5 py-3 space-y-2 max-h-72 overflow-y-auto">
          {command.action === "create" ? (
            <CreatePreviewItem
              title={command.newTitle || ""}
              priority={command.priority}
              area={command.area}
              color={config.color}
              borderColor={config.borderColor}
            />
          ) : (
            matchedTasks.map((task) => (
              <TaskPreviewItem
                key={task.id}
                task={task}
                action={command.action}
                color={config.color}
                borderColor={config.borderColor}
                priority={command.priority}
                area={command.area}
              />
            ))
          )}
        </div>

        {/* Actions */}
        <div
          className="flex items-center justify-between px-5 py-3"
          style={{ borderTop: "1px solid var(--border-primary)" }}
        >
          <span
            className="text-xs"
            style={{ color: "var(--text-tertiary)" }}
          >
            Enter to confirm &middot; Esc to cancel
          </span>
          <div className="flex gap-2">
            <button
              ref={cancelRef}
              onClick={onCancel}
              className="rounded-lg px-4 py-2 text-sm font-medium transition-colors"
              style={{
                background: "var(--bg-tertiary)",
                color: "var(--text-secondary)",
              }}
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className="rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors"
              style={{ background: config.color }}
            >
              {config.label}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TaskPreviewItem({
  task,
  action,
  color,
  borderColor,
  priority,
  area,
}: {
  task: Task;
  action: CommandAction;
  color: string;
  borderColor: string;
  priority?: TaskPriority;
  area?: AreaId;
}) {
  const isDelete = action === "delete" || action === "cancel";
  const isComplete = action === "complete";

  return (
    <div
      className="flex items-center gap-3 rounded-lg px-4 py-3 transition-all"
      style={{
        background: `${color}08`,
        border: `1px solid ${borderColor}`,
        opacity: isDelete ? 0.8 : 1,
      }}
    >
      {/* Selection indicator */}
      <div
        className="h-3 w-3 rounded-full shrink-0"
        style={{
          background: color,
          boxShadow: `0 0 6px ${color}60`,
          animation: "previewPulse 1.5s ease-in-out infinite",
        }}
      />

      <div className="flex-1 min-w-0">
        <p
          className="text-sm font-medium truncate"
          style={{
            color: "var(--text-primary)",
            textDecoration: isDelete ? "line-through" : isComplete ? "line-through" : "none",
            opacity: isDelete ? 0.6 : 1,
          }}
        >
          {task.title}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          {task.area && (
            <span
              className="text-xs font-medium px-1.5 py-0.5 rounded"
              style={{
                background: `${AREA_COLOR_MAP[AREAS[task.area]?.color] || "#64748B"}15`,
                color: AREA_COLOR_MAP[AREAS[task.area]?.color] || "#64748B",
              }}
            >
              {AREAS[task.area]?.name}
            </span>
          )}
          {action === "set_priority" && priority && (
            <span className="text-xs font-medium" style={{ color }}>
              &rarr; {priority}
            </span>
          )}
          {action === "set_area" && area && (
            <span className="text-xs font-medium" style={{ color }}>
              &rarr; {AREAS[area]?.name || area}
            </span>
          )}
        </div>
      </div>

      {/* Action badge */}
      <span
        className="text-xs font-semibold px-2 py-1 rounded-full shrink-0"
        style={{ background: `${color}15`, color }}
      >
        {action === "delete"
          ? "DELETE"
          : action === "complete"
            ? "DONE"
            : action === "start"
              ? "START"
              : action === "cancel"
                ? "CANCEL"
                : action === "reopen"
                  ? "REOPEN"
                  : action === "set_priority"
                    ? (priority || "").toUpperCase()
                    : "MOVE"}
      </span>
    </div>
  );
}

function CreatePreviewItem({
  title,
  priority,
  area,
  color,
  borderColor,
}: {
  title: string;
  priority?: TaskPriority;
  area?: AreaId;
  color: string;
  borderColor: string;
}) {
  return (
    <div
      className="flex items-center gap-3 rounded-lg px-4 py-3"
      style={{
        background: `${color}08`,
        border: `1px dashed ${borderColor}`,
      }}
    >
      <div
        className="h-3 w-3 rounded-full shrink-0"
        style={{
          background: color,
          boxShadow: `0 0 6px ${color}60`,
          animation: "previewPulse 1.5s ease-in-out infinite",
        }}
      />
      <div className="flex-1 min-w-0">
        <p
          className="text-sm font-medium truncate"
          style={{ color: "var(--text-primary)" }}
        >
          {title}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          {priority && (
            <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
              Priority: {priority}
            </span>
          )}
          {area && (
            <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
              Area: {AREAS[area]?.name || area}
            </span>
          )}
        </div>
      </div>
      <span
        className="text-xs font-semibold px-2 py-1 rounded-full shrink-0"
        style={{ background: `${color}15`, color }}
      >
        NEW
      </span>
    </div>
  );
}

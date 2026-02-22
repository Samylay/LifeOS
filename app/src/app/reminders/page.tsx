"use client";

import { useState } from "react";
import {
  Bell,
  Plus,
  Check,
  Clock,
  AlertTriangle,
  Repeat,
  X,
  Trash2,
  Calendar,
} from "lucide-react";
import { useReminders } from "@/lib/use-reminders";
import { AREAS } from "@/lib/types";
import type { ReminderFrequency, AreaId } from "@/lib/types";

const FREQ_LABELS: Record<ReminderFrequency, string> = {
  once: "One-time",
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  yearly: "Yearly",
};

const FREQ_COLORS: Record<ReminderFrequency, string> = {
  once: "var(--text-tertiary)",
  daily: "#7C9E8A",
  weekly: "#3B82F6",
  monthly: "#8B5CF6",
  yearly: "#F59E0B",
};

export default function RemindersPage() {
  const {
    overdue,
    dueToday,
    upcoming,
    completed,
    loading,
    createReminder,
    completeReminder,
    deleteReminder,
  } = useReminders();
  const [showForm, setShowForm] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);

  // Form state
  const [title, setTitle] = useState("");
  const [frequency, setFrequency] = useState<ReminderFrequency>("once");
  const [dueDate, setDueDate] = useState(new Date().toISOString().split("T")[0]);
  const [time, setTime] = useState("");
  const [area, setArea] = useState<AreaId | "">("");
  const [notes, setNotes] = useState("");

  const handleSubmit = async () => {
    if (!title.trim()) return;
    await createReminder({
      title: title.trim(),
      frequency,
      dueDate: new Date(dueDate),
      time: time || undefined,
      area: area || undefined,
      notes: notes || undefined,
    });
    setTitle("");
    setFrequency("once");
    setDueDate(new Date().toISOString().split("T")[0]);
    setTime("");
    setArea("");
    setNotes("");
    setShowForm(false);
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Bell size={24} style={{ color: "var(--accent)" }} />
          <h1 className="text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>
            Reminders
          </h1>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium bg-sage-400 text-white hover:bg-sage-500 transition-colors"
        >
          <Plus size={16} />
          Add
        </button>
      </div>

      {/* Quick add form */}
      {showForm && (
        <div
          className="rounded-xl p-5 mb-6"
          style={{
            background: "var(--bg-secondary)",
            border: "1px solid var(--accent)",
          }}
        >
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Reminder title..."
            autoFocus
            className="w-full text-base font-medium bg-transparent outline-none mb-3"
            style={{ color: "var(--text-primary)" }}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          />

          <div className="flex flex-wrap gap-2 mb-3">
            <select
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as ReminderFrequency)}
              className="text-xs rounded-lg px-3 py-2 outline-none"
              style={{
                background: "var(--bg-tertiary)",
                color: "var(--text-primary)",
                border: "1px solid var(--border-primary)",
              }}
            >
              {Object.entries(FREQ_LABELS).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="text-xs rounded-lg px-3 py-2 outline-none"
              style={{
                background: "var(--bg-tertiary)",
                color: "var(--text-primary)",
                border: "1px solid var(--border-primary)",
              }}
            />
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="text-xs rounded-lg px-3 py-2 outline-none"
              style={{
                background: "var(--bg-tertiary)",
                color: "var(--text-primary)",
                border: "1px solid var(--border-primary)",
              }}
            />
            <select
              value={area}
              onChange={(e) => setArea(e.target.value as AreaId | "")}
              className="text-xs rounded-lg px-3 py-2 outline-none"
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
          </div>

          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes (optional)..."
            rows={2}
            className="w-full text-sm rounded-lg px-3 py-2 outline-none resize-none mb-3"
            style={{
              background: "var(--bg-tertiary)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-primary)",
            }}
          />

          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowForm(false)}
              className="text-sm px-3 py-1.5 rounded-lg"
              style={{ color: "var(--text-secondary)" }}
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              className="text-sm px-4 py-1.5 rounded-lg bg-sage-400 text-white font-medium"
            >
              Save
            </button>
          </div>
        </div>
      )}

      {/* Overdue */}
      {overdue.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={16} style={{ color: "#EF4444" }} />
            <h2 className="text-sm font-semibold" style={{ color: "#EF4444" }}>
              Overdue ({overdue.length})
            </h2>
          </div>
          <div className="space-y-2">
            {overdue.map((r) => (
              <ReminderItem key={r.id} reminder={r} onComplete={completeReminder} onDelete={deleteReminder} isOverdue />
            ))}
          </div>
        </div>
      )}

      {/* Due Today */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Clock size={16} style={{ color: "var(--accent)" }} />
          <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            Due Today ({dueToday.length})
          </h2>
        </div>
        {dueToday.length === 0 ? (
          <p className="text-sm py-4 text-center" style={{ color: "var(--text-tertiary)" }}>
            Nothing due today. Enjoy!
          </p>
        ) : (
          <div className="space-y-2">
            {dueToday.map((r) => (
              <ReminderItem key={r.id} reminder={r} onComplete={completeReminder} onDelete={deleteReminder} />
            ))}
          </div>
        )}
      </div>

      {/* Upcoming */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Calendar size={16} style={{ color: "var(--text-secondary)" }} />
          <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            Upcoming ({upcoming.length})
          </h2>
        </div>
        {upcoming.length === 0 ? (
          <p className="text-sm py-4 text-center" style={{ color: "var(--text-tertiary)" }}>
            No upcoming reminders.
          </p>
        ) : (
          <div className="space-y-2">
            {upcoming.map((r) => (
              <ReminderItem key={r.id} reminder={r} onComplete={completeReminder} onDelete={deleteReminder} />
            ))}
          </div>
        )}
      </div>

      {/* Completed */}
      {completed.length > 0 && (
        <div>
          <button
            onClick={() => setShowCompleted(!showCompleted)}
            className="flex items-center gap-2 mb-3 text-sm font-medium"
            style={{ color: "var(--text-tertiary)" }}
          >
            <Check size={14} />
            Completed ({completed.length})
          </button>
          {showCompleted && (
            <div className="space-y-2 opacity-60">
              {completed.map((r) => (
                <ReminderItem key={r.id} reminder={r} onComplete={completeReminder} onDelete={deleteReminder} isDone />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ReminderItem({
  reminder,
  onComplete,
  onDelete,
  isOverdue,
  isDone,
}: {
  reminder: {
    id: string;
    title: string;
    frequency: ReminderFrequency;
    dueDate: Date;
    time?: string;
    area?: AreaId;
    notes?: string;
    completed: boolean;
  };
  onComplete: (id: string) => void;
  onDelete: (id: string) => void;
  isOverdue?: boolean;
  isDone?: boolean;
}) {
  const AREA_COLORS: Record<string, string> = {
    teal: "#14B8A6",
    indigo: "#6366F1",
    amber: "#F59E0B",
    violet: "#8B5CF6",
    slate: "#64748B",
  };

  return (
    <div
      className="group flex items-center gap-3 rounded-lg px-4 py-3"
      style={{
        background: "var(--bg-secondary)",
        border: isOverdue
          ? "1px solid #EF444440"
          : "1px solid var(--border-primary)",
      }}
    >
      <button
        onClick={() => onComplete(reminder.id)}
        className="shrink-0 h-5 w-5 rounded-full flex items-center justify-center transition-colors"
        style={{
          border: isDone ? "none" : isOverdue ? "2px solid #EF4444" : "2px solid var(--text-tertiary)",
          background: isDone ? "var(--accent)" : "transparent",
        }}
      >
        {isDone && <Check size={12} className="text-white" />}
      </button>

      <div className="flex-1 min-w-0">
        <p
          className="text-sm font-medium truncate"
          style={{
            color: "var(--text-primary)",
            textDecoration: isDone ? "line-through" : "none",
          }}
        >
          {reminder.title}
        </p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className="text-xs" style={{ color: isOverdue ? "#EF4444" : "var(--text-tertiary)" }}>
            {new Date(reminder.dueDate).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })}
            {reminder.time && ` at ${reminder.time}`}
          </span>
          {reminder.frequency !== "once" && (
            <span
              className="flex items-center gap-0.5 text-xs font-medium px-1.5 py-0.5 rounded"
              style={{
                background: `${FREQ_COLORS[reminder.frequency]}15`,
                color: FREQ_COLORS[reminder.frequency],
              }}
            >
              <Repeat size={8} />
              {FREQ_LABELS[reminder.frequency]}
            </span>
          )}
          {reminder.area && (
            <span
              className="text-xs px-1.5 py-0.5 rounded"
              style={{
                background: `${AREA_COLORS[AREAS[reminder.area]?.color] || "#64748B"}15`,
                color: AREA_COLORS[AREAS[reminder.area]?.color] || "#64748B",
              }}
            >
              {AREAS[reminder.area]?.name}
            </span>
          )}
        </div>
      </div>

      <button
        onClick={() => onDelete(reminder.id)}
        className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-1"
        style={{ color: "var(--text-tertiary)" }}
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

"use client";

import { useState } from "react";
import { Clock, Plus, X, Play, Trash2, Calendar } from "lucide-react";
import { useFocusBlocks, BLOCK_TEMPLATES } from "@/lib/use-focus-blocks";
import type { FocusBlock, FocusBlockStatus, AreaId } from "@/lib/types";
import { AREAS } from "@/lib/types";

const AREA_COLORS: Record<string, string> = {
  health: "#14B8A6",
  career: "#6366F1",
  finance: "#F59E0B",
  brand: "#8B5CF6",
  admin: "#64748B",
};

const STATUS_COLORS: Record<FocusBlockStatus, string> = {
  scheduled: "#3B82F6",
  active: "#10B981",
  done: "#64748B",
};

// --- Create Form ---

function BlockCreateForm({ onSubmit, onCancel }: {
  onSubmit: (data: Omit<FocusBlock, "id" | "sessionIds" | "sessionCount">) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("11:00");
  const [area, setArea] = useState<AreaId | "">("");
  const [goal, setGoal] = useState("");
  const [sessionDuration, setSessionDuration] = useState(25);
  const [breakDuration, setBreakDuration] = useState(5);
  const [bufferMinutes, setBufferMinutes] = useState(10);
  const [autoStart, setAutoStart] = useState(false);

  const applyTemplate = (template: typeof BLOCK_TEMPLATES[0]) => {
    setTitle(template.title);
    setSessionDuration(template.sessionDuration);
    setBreakDuration(template.breakDuration);
    setBufferMinutes(template.bufferMinutes);
    // Calculate end time from start time + duration
    const [h, m] = startTime.split(":").map(Number);
    const endMin = h * 60 + m + template.duration;
    const endH = Math.floor(endMin / 60);
    const endM = endMin % 60;
    setEndTime(`${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !date) return;
    onSubmit({
      title: title.trim(),
      date,
      startTime,
      endTime,
      area: area || undefined,
      goal: goal.trim() || undefined,
      sessionDuration,
      breakDuration,
      bufferMinutes,
      autoStart,
      status: "scheduled",
    });
  };

  // Calculate sessions preview
  const startMin = parseInt(startTime.split(":")[0]) * 60 + parseInt(startTime.split(":")[1]);
  const endMin = parseInt(endTime.split(":")[0]) * 60 + parseInt(endTime.split(":")[1]);
  const totalMin = endMin - startMin - bufferMinutes;
  const cycleMin = sessionDuration + breakDuration;
  const sessionCount = cycleMin > 0 ? Math.floor((totalMin + breakDuration) / cycleMin) : 0;

  return (
    <form onSubmit={handleSubmit} className="rounded-xl p-5 space-y-4" style={{ background: "var(--bg-secondary)", border: "1px solid var(--accent)" }}>
      {/* Templates */}
      <div>
        <label className="text-xs font-medium mb-2 block" style={{ color: "var(--text-secondary)" }}>Quick Templates</label>
        <div className="flex flex-wrap gap-2">
          {BLOCK_TEMPLATES.map((t) => (
            <button key={t.name} type="button" onClick={() => applyTemplate(t)}
              className="text-xs px-3 py-1.5 rounded-lg transition-colors"
              style={{ background: "var(--bg-tertiary)", color: "var(--text-primary)", border: "1px solid var(--border-primary)" }}>
              {t.name}
            </button>
          ))}
        </div>
      </div>

      <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Block title..."
        autoFocus className="w-full bg-transparent text-sm font-medium outline-none" style={{ color: "var(--text-primary)" }} />

      <input type="text" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Goal for this block..."
        className="w-full bg-transparent text-xs outline-none" style={{ color: "var(--text-secondary)" }} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <label className="text-xs block mb-1" style={{ color: "var(--text-tertiary)" }}>Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
            className="w-full text-xs rounded-lg px-2 py-1.5 outline-none"
            style={{ background: "var(--bg-tertiary)", color: "var(--text-primary)", border: "1px solid var(--border-primary)" }} />
        </div>
        <div>
          <label className="text-xs block mb-1" style={{ color: "var(--text-tertiary)" }}>Start</label>
          <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)}
            className="w-full text-xs rounded-lg px-2 py-1.5 outline-none"
            style={{ background: "var(--bg-tertiary)", color: "var(--text-primary)", border: "1px solid var(--border-primary)" }} />
        </div>
        <div>
          <label className="text-xs block mb-1" style={{ color: "var(--text-tertiary)" }}>End</label>
          <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)}
            className="w-full text-xs rounded-lg px-2 py-1.5 outline-none"
            style={{ background: "var(--bg-tertiary)", color: "var(--text-primary)", border: "1px solid var(--border-primary)" }} />
        </div>
        <div>
          <label className="text-xs block mb-1" style={{ color: "var(--text-tertiary)" }}>Area</label>
          <select value={area} onChange={(e) => setArea(e.target.value as AreaId | "")}
            className="w-full text-xs rounded-lg px-2 py-1.5 outline-none"
            style={{ background: "var(--bg-tertiary)", color: "var(--text-primary)", border: "1px solid var(--border-primary)" }}>
            <option value="">None</option>
            {Object.entries(AREAS).map(([id, a]) => (<option key={id} value={id}>{a.name}</option>))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="text-xs block mb-1" style={{ color: "var(--text-tertiary)" }}>Session (min)</label>
          <input type="number" value={sessionDuration} onChange={(e) => setSessionDuration(parseInt(e.target.value) || 25)}
            min={5} max={120} className="w-full text-xs rounded-lg px-2 py-1.5 outline-none"
            style={{ background: "var(--bg-tertiary)", color: "var(--text-primary)", border: "1px solid var(--border-primary)" }} />
        </div>
        <div>
          <label className="text-xs block mb-1" style={{ color: "var(--text-tertiary)" }}>Break (min)</label>
          <input type="number" value={breakDuration} onChange={(e) => setBreakDuration(parseInt(e.target.value) || 5)}
            min={0} max={30} className="w-full text-xs rounded-lg px-2 py-1.5 outline-none"
            style={{ background: "var(--bg-tertiary)", color: "var(--text-primary)", border: "1px solid var(--border-primary)" }} />
        </div>
        <div>
          <label className="text-xs block mb-1" style={{ color: "var(--text-tertiary)" }}>Buffer (min)</label>
          <input type="number" value={bufferMinutes} onChange={(e) => setBufferMinutes(parseInt(e.target.value) || 0)}
            min={0} max={60} className="w-full text-xs rounded-lg px-2 py-1.5 outline-none"
            style={{ background: "var(--bg-tertiary)", color: "var(--text-primary)", border: "1px solid var(--border-primary)" }} />
        </div>
      </div>

      {/* Preview */}
      <div className="rounded-lg px-3 py-2 flex items-center justify-between" style={{ background: "var(--bg-tertiary)" }}>
        <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
          {sessionCount} sessions x {sessionDuration}min + {breakDuration}min breaks
        </span>
        <label className="flex items-center gap-2 text-xs" style={{ color: "var(--text-secondary)" }}>
          <input type="checkbox" checked={autoStart} onChange={(e) => setAutoStart(e.target.checked)} />
          Auto-start
        </label>
      </div>

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="text-xs px-3 py-1.5 rounded-lg" style={{ color: "var(--text-secondary)" }}>Cancel</button>
        <button type="submit" className="text-xs px-4 py-1.5 rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 transition-colors font-medium">
          Schedule Block
        </button>
      </div>
    </form>
  );
}

// --- Block Card ---

function BlockCard({ block, onUpdate, onDelete }: {
  block: FocusBlock;
  onUpdate: (id: string, data: Partial<FocusBlock>) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="rounded-xl p-4 transition-all group" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}>
      <div className="flex items-start justify-between mb-2">
        <div>
          <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{block.title}</h3>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs font-mono" style={{ color: "var(--text-tertiary)" }}>
              {block.startTime} — {block.endTime}
            </span>
            {block.area && (
              <span className="text-xs px-1.5 py-0.5 rounded"
                style={{ background: `${AREA_COLORS[block.area] || "#64748B"}15`, color: AREA_COLORS[block.area] || "#64748B" }}>
                {AREAS[block.area]?.name}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs px-2 py-0.5 rounded-full capitalize"
            style={{ background: `${STATUS_COLORS[block.status]}20`, color: STATUS_COLORS[block.status] }}>
            {block.status}
          </span>
        </div>
      </div>

      {block.goal && (
        <p className="text-xs mb-2" style={{ color: "var(--text-secondary)" }}>Goal: {block.goal}</p>
      )}

      <div className="flex items-center justify-between">
        <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
          {block.sessionCount} sessions x {block.sessionDuration}min
          {block.bufferMinutes > 0 && ` | ${block.bufferMinutes}min buffer`}
        </span>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {block.status === "scheduled" && (
            <button onClick={() => onUpdate(block.id, { status: "active" })}
              className="p-1.5 rounded-lg transition-colors" style={{ color: "#10B981" }}>
              <Play size={14} />
            </button>
          )}
          {block.status === "active" && (
            <button onClick={() => onUpdate(block.id, { status: "done" })}
              className="p-1.5 rounded-lg text-xs font-medium" style={{ color: "#6366F1" }}>
              Done
            </button>
          )}
          <button onClick={() => onDelete(block.id)}
            className="p-1.5 rounded-lg transition-colors" style={{ color: "var(--text-tertiary)" }}>
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Main Page ---

export default function FocusBlocksPage() {
  const { blocks, loading, createBlock, updateBlock, deleteBlock } = useFocusBlocks();
  const [showForm, setShowForm] = useState(false);

  const today = new Date().toISOString().split("T")[0];
  const todayBlocks = blocks.filter((b) => b.date === today);
  const upcomingBlocks = blocks.filter((b) => b.date > today);
  const pastBlocks = blocks.filter((b) => b.date < today);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>Focus Blocks</h1>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium bg-emerald-500 text-white hover:bg-emerald-600 transition-colors">
          <Plus size={16} /> Schedule Block
        </button>
      </div>

      {showForm && (
        <div className="mb-6">
          <BlockCreateForm
            onSubmit={(data) => { createBlock(data); setShowForm(false); }}
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}

      {blocks.length === 0 && !showForm ? (
        <div className="flex flex-col items-center justify-center py-16 rounded-xl"
          style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}>
          <Clock size={48} style={{ color: "var(--text-tertiary)" }} className="mb-4" />
          <p className="text-lg font-medium" style={{ color: "var(--text-primary)" }}>No focus blocks scheduled</p>
          <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>Schedule time blocks for deep work sessions.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Today */}
          {todayBlocks.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--accent)" }}>Today</h2>
              <div className="space-y-3">
                {todayBlocks.map((block) => (
                  <BlockCard key={block.id} block={block} onUpdate={updateBlock} onDelete={deleteBlock} />
                ))}
              </div>
            </div>
          )}

          {/* Upcoming */}
          {upcomingBlocks.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-secondary)" }}>Upcoming</h2>
              <div className="space-y-3">
                {upcomingBlocks.map((block) => (
                  <BlockCard key={block.id} block={block} onUpdate={updateBlock} onDelete={deleteBlock} />
                ))}
              </div>
            </div>
          )}

          {/* Past */}
          {pastBlocks.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-tertiary)" }}>Past</h2>
              <div className="space-y-3 opacity-60">
                {pastBlocks.map((block) => (
                  <BlockCard key={block.id} block={block} onUpdate={updateBlock} onDelete={deleteBlock} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

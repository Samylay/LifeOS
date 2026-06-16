"use client";

import { useState } from "react";
import {
  Activity,
  Plus,
  Trash2,
  Pencil,
  X,
  Check,
  ChevronRight,
  GraduationCap,
  RotateCcw,
} from "lucide-react";
import { useStrength } from "@/lib/use-strength";
import { useToast } from "@/components/toast";
import {
  weekOfBuild,
  sessionsThisWeek,
  buildComplete,
  targetFreq,
  type StrengthFocus,
  type StrengthState,
} from "@/lib/types";

const STATE_LABEL: Record<StrengthState, string> = {
  building: "Build",
  maintaining: "Maintain",
  queued: "Queued",
};

// --- Focus editor (create/edit) ---

type Draft = Omit<StrengthFocus, "id" | "createdAt" | "updatedAt" | "log" | "buildStarted">;

function FocusEditor({
  initial,
  defaultOrder,
  onSave,
  onCancel,
}: {
  initial?: StrengthFocus;
  defaultOrder: number;
  onSave: (data: Draft) => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState(initial?.label || "");
  const [buildWeeks, setBuildWeeks] = useState((initial?.buildWeeks ?? 4).toString());
  const [buildTargetFreq, setBuildTargetFreq] = useState((initial?.buildTargetFreq ?? 3).toString());
  const [maintainFreq, setMaintainFreq] = useState((initial?.maintainFreq ?? 1).toString());
  const [exercises, setExercises] = useState((initial?.exercises || []).join("\n"));
  const [note, setNote] = useState(initial?.note || "");

  const inputStyle = {
    color: "var(--text-primary)",
    background: "var(--bg-tertiary)",
    border: "1px solid var(--border-primary)",
  };

  const handleSave = () => {
    if (!label.trim()) return;
    onSave({
      label: label.trim(),
      state: initial?.state ?? "queued",
      order: initial?.order ?? defaultOrder,
      buildWeeks: Number(buildWeeks) || 4,
      buildTargetFreq: Number(buildTargetFreq) || 3,
      maintainFreq: Number(maintainFreq) || 1,
      exercises: exercises.split("\n").map((s) => s.trim()).filter(Boolean),
      note: note.trim() || undefined,
    });
  };

  return (
    <div
      className="rounded-xl p-4 space-y-3"
      style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}
    >
      <input
        type="text"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Focus name (e.g. Core & Balance)…"
        autoFocus
        className="w-full text-sm font-medium outline-none rounded-lg px-3 py-2"
        style={inputStyle}
      />

      <div className="flex gap-2 flex-wrap">
        <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--text-tertiary)" }}>
          Build weeks
          <input
            type="number"
            value={buildWeeks}
            onChange={(e) => setBuildWeeks(e.target.value)}
            className="w-24 text-xs outline-none rounded-lg px-2 py-1.5 text-center"
            style={inputStyle}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--text-tertiary)" }}>
          Build ×/week
          <input
            type="number"
            value={buildTargetFreq}
            onChange={(e) => setBuildTargetFreq(e.target.value)}
            className="w-24 text-xs outline-none rounded-lg px-2 py-1.5 text-center"
            style={inputStyle}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--text-tertiary)" }}>
          Maintain ×/week
          <input
            type="number"
            value={maintainFreq}
            onChange={(e) => setMaintainFreq(e.target.value)}
            className="w-24 text-xs outline-none rounded-lg px-2 py-1.5 text-center"
            style={inputStyle}
          />
        </label>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-tertiary)" }}>
          Exercises (one per line)
        </p>
        <textarea
          value={exercises}
          onChange={(e) => setExercises(e.target.value)}
          rows={4}
          placeholder="Dead bug — 3×10/side&#10;Pallof press — 3×10/side"
          className="w-full text-sm outline-none rounded-lg px-3 py-2 resize-none"
          style={inputStyle}
        />
      </div>

      <input
        type="text"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Note (optional)"
        className="w-full text-xs outline-none rounded-lg px-3 py-2"
        style={{ ...inputStyle, color: "var(--text-secondary)" }}
      />

      <div className="flex items-center gap-2 justify-end">
        <button
          onClick={onCancel}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium"
          style={{ color: "var(--text-secondary)", background: "var(--bg-tertiary)" }}
        >
          <X size={14} /> Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={!label.trim()}
          className="flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium bg-sage-400 text-white hover:bg-sage-500 transition-colors disabled:opacity-50"
        >
          <Check size={14} /> Save
        </button>
      </div>
    </div>
  );
}

// --- Progress bar ---

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--bg-tertiary)" }}>
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${pct}%`, background: "var(--accent)" }}
      />
    </div>
  );
}

// --- Building focus hero card ---

function BuildingCard({
  focus,
  onLog,
  onUndo,
  onGraduate,
  onEdit,
  nextLabel,
}: {
  focus: StrengthFocus;
  onLog: () => void;
  onUndo: () => void;
  onGraduate: () => void;
  onEdit: () => void;
  nextLabel?: string;
}) {
  const week = weekOfBuild(focus);
  const done = sessionsThisWeek(focus);
  const target = targetFreq(focus);
  const complete = buildComplete(focus);

  return (
    <div
      className="rounded-xl p-5"
      style={{ background: "var(--bg-secondary)", border: "1px solid var(--accent)", boxShadow: "var(--shadow-sm)" }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <span
            className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
            style={{ background: "var(--accent-bg)", color: "var(--accent)" }}
          >
            Building · Week {week} of {focus.buildWeeks}
          </span>
          <h2 className="text-xl font-semibold mt-2" style={{ color: "var(--text-primary)" }}>
            {focus.label}
          </h2>
        </div>
        <button onClick={onEdit} title="Edit" className="p-1.5 rounded-lg" style={{ color: "var(--text-tertiary)" }}>
          <Pencil size={15} />
        </button>
      </div>

      {/* Week progress */}
      <div className="mt-4">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
            This week
          </span>
          <span className="text-xs font-mono" style={{ color: "var(--accent)" }}>
            {done} / {target}
          </span>
        </div>
        <ProgressBar value={done} max={target} />
      </div>

      {/* Exercises */}
      {focus.exercises.length > 0 && (
        <ul className="mt-4 space-y-1">
          {focus.exercises.map((ex, i) => (
            <li key={i} className="text-sm flex items-start gap-2" style={{ color: "var(--text-secondary)" }}>
              <span style={{ color: "var(--accent)" }}>•</span>
              {ex}
            </li>
          ))}
        </ul>
      )}

      {/* Actions */}
      <div className="mt-5 flex items-center gap-2 flex-wrap">
        <button
          onClick={onLog}
          className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium bg-sage-400 text-white hover:bg-sage-500 transition-colors"
        >
          <Check size={15} /> Log session
        </button>
        {focus.log.length > 0 && (
          <button
            onClick={onUndo}
            title="Undo last logged session"
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium"
            style={{ color: "var(--text-secondary)", background: "var(--bg-tertiary)" }}
          >
            <RotateCcw size={14} /> Undo
          </button>
        )}
        {complete && (
          <button
            onClick={onGraduate}
            className="ml-auto flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium"
            style={{ color: "var(--accent)", background: "var(--accent-bg)" }}
          >
            <GraduationCap size={15} />
            Graduate{nextLabel ? ` → ${nextLabel}` : ""}
          </button>
        )}
      </div>
    </div>
  );
}

// --- Maintenance / queued row ---

function FocusRow({
  focus,
  onLog,
  onEdit,
  onDelete,
}: {
  focus: StrengthFocus;
  onLog: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const done = sessionsThisWeek(focus);
  const target = targetFreq(focus);
  const maintaining = focus.state === "maintaining";
  const met = maintaining && done >= target;

  return (
    <div
      className="rounded-xl p-4 flex items-center gap-3"
      style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}
    >
      <div
        className="shrink-0 flex h-9 w-9 items-center justify-center rounded-lg"
        style={{ background: "var(--bg-tertiary)" }}
      >
        <Activity size={16} style={{ color: maintaining ? "var(--accent)" : "var(--text-tertiary)" }} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>
          {focus.label}
        </p>
        <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
          {STATE_LABEL[focus.state]}
          {maintaining ? ` · ${done}/${target} this week${met ? " ✓" : ""}` : ""}
          {focus.note && focus.state === "queued" ? ` · ${focus.note}` : ""}
        </p>
      </div>
      {maintaining && (
        <button
          onClick={onLog}
          title="Log a maintenance session"
          className="shrink-0 flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium"
          style={{ color: "var(--accent)", background: "var(--accent-bg)" }}
        >
          <Check size={13} /> Log
        </button>
      )}
      <button onClick={onEdit} title="Edit" className="shrink-0 p-1.5 rounded-lg" style={{ color: "var(--text-tertiary)" }}>
        <Pencil size={14} />
      </button>
      <button onClick={onDelete} title="Delete" className="shrink-0 p-1.5 rounded-lg" style={{ color: "var(--text-tertiary)" }}>
        <Trash2 size={14} />
      </button>
    </div>
  );
}

// --- Page ---

export default function StrengthPage() {
  const {
    focuses,
    loading,
    building,
    maintaining,
    queued,
    createFocus,
    updateFocus,
    deleteFocus,
    logSession,
    undoLastSession,
    graduate,
    seedDefaults,
  } = useStrength();
  const { toast } = useToast();
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const nextLabel = queued[0]?.label;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
            <Activity size={22} style={{ color: "var(--accent)" }} /> Strength
          </h1>
          <p className="text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>
            Build one focus, maintain the rest — all in service of the run.
          </p>
        </div>
        {!creating && (
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium bg-sage-400 text-white hover:bg-sage-500 transition-colors"
          >
            <Plus size={15} /> New focus
          </button>
        )}
      </div>

      {creating && (
        <FocusEditor
          defaultOrder={focuses.length}
          onSave={(data) => {
            createFocus({ ...data, log: [] });
            setCreating(false);
            toast("Focus added");
          }}
          onCancel={() => setCreating(false)}
        />
      )}

      {/* Empty / seed state */}
      {focuses.length === 0 && !loading && !creating && (
        <div
          className="flex flex-col items-center justify-center py-16 rounded-xl text-center"
          style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}
        >
          <Activity size={48} style={{ color: "var(--text-tertiary)" }} className="mb-4" />
          <p className="text-lg font-medium" style={{ color: "var(--text-primary)" }}>
            No strength plan yet
          </p>
          <p className="text-sm mt-1 mb-4 max-w-sm" style={{ color: "var(--text-secondary)" }}>
            Start with the default build-then-maintain queue (Core &amp; Balance → Plyometrics →
            Shoulders &amp; Back), or add your own focus.
          </p>
          <button
            onClick={() => {
              seedDefaults();
              toast("Seeded default plan");
            }}
            className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium bg-sage-400 text-white hover:bg-sage-500 transition-colors"
          >
            <Plus size={15} /> Use the starter queue
          </button>
        </div>
      )}

      {/* Building focus */}
      {building &&
        (editingId === building.id ? (
          <FocusEditor
            initial={building}
            defaultOrder={building.order}
            onSave={(data) => {
              updateFocus(building.id, data);
              setEditingId(null);
            }}
            onCancel={() => setEditingId(null)}
          />
        ) : (
          <BuildingCard
            focus={building}
            nextLabel={nextLabel}
            onLog={() => {
              logSession(building.id);
              toast("Session logged");
            }}
            onUndo={() => undoLastSession(building.id)}
            onGraduate={() => {
              graduate(building.id);
              toast(nextLabel ? `Graduated → ${nextLabel}` : "Graduated to maintenance");
            }}
            onEdit={() => setEditingId(building.id)}
          />
        ))}

      {/* Maintenance pool */}
      {maintaining.length > 0 && (
        <div>
          <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "var(--text-secondary)" }}>
            Maintaining
          </p>
          <div className="space-y-2">
            {maintaining.map((f) =>
              editingId === f.id ? (
                <FocusEditor
                  key={f.id}
                  initial={f}
                  defaultOrder={f.order}
                  onSave={(data) => {
                    updateFocus(f.id, data);
                    setEditingId(null);
                  }}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <FocusRow
                  key={f.id}
                  focus={f}
                  onLog={() => {
                    logSession(f.id);
                    toast("Session logged");
                  }}
                  onEdit={() => setEditingId(f.id)}
                  onDelete={() => deleteFocus(f.id)}
                />
              )
            )}
          </div>
        </div>
      )}

      {/* Queue */}
      {queued.length > 0 && (
        <div>
          <p className="text-xs font-bold uppercase tracking-widest mb-2 flex items-center gap-1" style={{ color: "var(--text-secondary)" }}>
            Up next <ChevronRight size={12} />
          </p>
          <div className="space-y-2">
            {queued.map((f) =>
              editingId === f.id ? (
                <FocusEditor
                  key={f.id}
                  initial={f}
                  defaultOrder={f.order}
                  onSave={(data) => {
                    updateFocus(f.id, data);
                    setEditingId(null);
                  }}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <FocusRow
                  key={f.id}
                  focus={f}
                  onLog={() => {}}
                  onEdit={() => setEditingId(f.id)}
                  onDelete={() => deleteFocus(f.id)}
                />
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}

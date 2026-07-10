"use client";

import { useState } from "react";
import { GraduationCap, Plus, Pencil, Trash2, X, Check } from "lucide-react";
import { useLearnItems } from "@/lib/use-learn-items";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import type { LearnItem, LearnStatus } from "@/lib/types";

const STATUSES: { status: LearnStatus; label: string; color: string }[] = [
  { status: "parked", label: "Parked", color: "#64748B" },
  { status: "learning", label: "Learning", color: "#7C9E8A" },
  { status: "learned", label: "Learned", color: "#6366F1" },
];

const STATUS_META = Object.fromEntries(STATUSES.map((s) => [s.status, s])) as Record<
  LearnStatus,
  { status: LearnStatus; label: string; color: string }
>;

type Draft = Omit<LearnItem, "id" | "createdAt" | "updatedAt">;

const EMPTY: Draft = { topic: "", why: "", firstStep: "", status: "parked" };

const inputStyle = {
  color: "var(--text-primary)",
  background: "var(--bg-tertiary)",
  border: "1px solid var(--border-primary)",
};

function ItemEditor({
  initial,
  onSave,
  onCancel,
}: {
  initial?: LearnItem;
  onSave: (data: Draft) => void;
  onCancel: () => void;
}) {
  const [d, setD] = useState<Draft>(initial ? { firstStep: "", ...initial } : { ...EMPTY });
  const set = (patch: Partial<Draft>) => setD((prev) => ({ ...prev, ...patch }));

  return (
    <div className="rounded-xl p-4 space-y-3 enter" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}>
      <input
        type="text"
        value={d.topic}
        onChange={(e) => set({ topic: e.target.value })}
        placeholder="Topic (e.g. Chess openings)…"
        autoFocus
        className="w-full text-sm font-medium outline-none rounded-lg px-3 py-2"
        style={inputStyle}
      />
      <textarea
        value={d.why}
        onChange={(e) => set({ why: e.target.value })}
        rows={2}
        placeholder="Why — what pulled you toward it?"
        className="w-full text-sm outline-none rounded-lg px-3 py-2 resize-none"
        style={inputStyle}
      />
      <textarea
        value={d.firstStep || ""}
        onChange={(e) => set({ firstStep: e.target.value })}
        rows={2}
        placeholder="First step (optional) — smallest concrete entry point"
        className="w-full text-sm outline-none rounded-lg px-3 py-2 resize-none"
        style={inputStyle}
      />
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
          Status
        </span>
        {STATUSES.map((s) => (
          <button
            key={s.status}
            onClick={() => set({ status: s.status })}
            className="text-xs font-medium rounded-full px-3 py-1 transition-transform duration-150 active:scale-[0.97]"
            style={{
              color: d.status === s.status ? "#fff" : "var(--text-secondary)",
              background: d.status === s.status ? s.color : "var(--bg-tertiary)",
            }}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2 justify-end">
        <button onClick={onCancel} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-transform duration-150 active:scale-[0.97]" style={{ color: "var(--text-secondary)", background: "var(--bg-tertiary)" }}>
          <X size={14} /> Cancel
        </button>
        <button
          onClick={() => d.topic.trim() && onSave({ ...d, topic: d.topic.trim(), firstStep: d.firstStep?.trim() || undefined })}
          disabled={!d.topic.trim()}
          className="flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium bg-sage-400 text-white hover:bg-sage-500 transition-transform duration-150 active:scale-[0.97] disabled:opacity-50"
        >
          <Check size={14} /> Save
        </button>
      </div>
    </div>
  );
}

function ItemRow({
  item,
  onEdit,
  onDelete,
  onStatus,
}: {
  item: LearnItem;
  onEdit: () => void;
  onDelete: () => void;
  onStatus: (s: LearnStatus) => void;
}) {
  const meta = STATUS_META[item.status];
  return (
    <div className="rounded-xl p-4 hover-lift" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full" style={{ background: `${meta.color}20`, color: meta.color }}>
            {meta.label}
          </span>
          <h3 className="text-base font-semibold mt-2" style={{ color: "var(--text-primary)" }}>
            {item.topic}
          </h3>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={onEdit} aria-label="Edit item" className="p-1.5 rounded-lg transition-transform duration-150 active:scale-[0.92]" style={{ color: "var(--text-tertiary)" }}>
            <Pencil size={14} />
          </button>
          <button onClick={onDelete} aria-label="Delete item" className="p-1.5 rounded-lg transition-transform duration-150 active:scale-[0.92]" style={{ color: "var(--text-tertiary)" }}>
            <Trash2 size={14} />
          </button>
        </div>
      </div>
      {item.why && (
        <p className="text-sm mt-2 whitespace-pre-wrap" style={{ color: "var(--text-secondary)" }}>
          {item.why}
        </p>
      )}
      {item.firstStep && (
        <p className="text-xs mt-2" style={{ color: "var(--text-tertiary)" }}>
          <span className="font-semibold uppercase tracking-wider">First step · </span>
          {item.firstStep}
        </p>
      )}
      <div className="mt-3 flex items-center gap-1.5 flex-wrap">
        {STATUSES.map((s) => (
          <button
            key={s.status}
            onClick={() => onStatus(s.status)}
            className="text-[11px] font-medium rounded-full px-2.5 py-1 transition-transform duration-150 active:scale-[0.97]"
            style={{
              color: item.status === s.status ? "#fff" : "var(--text-tertiary)",
              background: item.status === s.status ? s.color : "var(--bg-tertiary)",
            }}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function LearningBacklog() {
  const { items, loading, createItem, updateItem, deleteItem } = useLearnItems();
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
            <GraduationCap size={18} style={{ color: "var(--accent)" }} /> Learning backlog
          </h2>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>
            Topics parked until there&rsquo;s time to learn or build them.
          </p>
        </div>
        {!creating && (
          <button onClick={() => setCreating(true)} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium bg-sage-400 text-white hover:bg-sage-500 transition-transform duration-150 active:scale-[0.97]">
            <Plus size={15} /> New item
          </button>
        )}
      </div>

      {creating && (
        <ItemEditor
          onSave={(data) => {
            createItem(data);
            setCreating(false);
            toast.success("Added to backlog");
          }}
          onCancel={() => setCreating(false)}
        />
      )}

      {items.length === 0 && !loading && !creating && (
        <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
          Nothing parked yet — add a topic you want to learn or build.
        </p>
      )}

      <div className="space-y-3">
        {items.map((it) =>
          editingId === it.id ? (
            <ItemEditor
              key={it.id}
              initial={it}
              onSave={(data) => {
                updateItem(it.id, data);
                setEditingId(null);
              }}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <ItemRow
              key={it.id}
              item={it}
              onEdit={() => setEditingId(it.id)}
              onDelete={() => setConfirmId(it.id)}
              onStatus={(s) => updateItem(it.id, { status: s })}
            />
          )
        )}
      </div>

      <ConfirmDialog
        open={confirmId !== null}
        title="Delete item?"
        message="This removes the item from your backlog."
        onConfirm={() => {
          if (confirmId) deleteItem(confirmId);
          setConfirmId(null);
        }}
        onCancel={() => setConfirmId(null)}
      />
    </div>
  );
}

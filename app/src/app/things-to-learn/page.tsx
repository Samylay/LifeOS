"use client";

import { useState } from "react";
import { GraduationCap, Plus, Pencil, Trash2, X, Check } from "lucide-react";
import { useLearnItems } from "@/lib/use-learn-items";
import { useToast } from "@/components/toast";
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
    <div className="rounded-xl p-4 space-y-3" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}>
      <input
        type="text"
        value={d.topic}
        onChange={(e) => set({ topic: e.target.value })}
        placeholder="Topic (e.g. Chess openings)…"
        autoFocus
        className="w-full text-sm font-medium outline-none rounded-lg px-3 py-2"
        style={inputStyle}
      />
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-tertiary)" }}>
          Why
        </p>
        <textarea
          value={d.why}
          onChange={(e) => set({ why: e.target.value })}
          rows={2}
          placeholder="What pulled you toward it?"
          className="w-full text-sm outline-none rounded-lg px-3 py-2 resize-none"
          style={inputStyle}
        />
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-tertiary)" }}>
          First step <span className="opacity-60 normal-case">(optional)</span>
        </p>
        <textarea
          value={d.firstStep || ""}
          onChange={(e) => set({ firstStep: e.target.value })}
          rows={2}
          placeholder="Smallest concrete entry point"
          className="w-full text-sm outline-none rounded-lg px-3 py-2 resize-none"
          style={inputStyle}
        />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
          Status
        </span>
        {STATUSES.map((s) => (
          <button
            key={s.status}
            onClick={() => set({ status: s.status })}
            className="text-xs font-medium rounded-full px-3 py-1 transition-colors"
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
        <button onClick={onCancel} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium" style={{ color: "var(--text-secondary)", background: "var(--bg-tertiary)" }}>
          <X size={14} /> Cancel
        </button>
        <button
          onClick={() => d.topic.trim() && onSave({ ...d, topic: d.topic.trim(), firstStep: d.firstStep?.trim() || undefined })}
          disabled={!d.topic.trim()}
          className="flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium bg-sage-400 text-white hover:bg-sage-500 transition-colors disabled:opacity-50"
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
    <div className="rounded-xl p-4" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full" style={{ background: `${meta.color}20`, color: meta.color }}>
            {meta.label}
          </span>
          <h2 className="text-base font-semibold mt-2" style={{ color: "var(--text-primary)" }}>
            {item.topic}
          </h2>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={onEdit} title="Edit" className="p-1.5 rounded-lg" style={{ color: "var(--text-tertiary)" }}>
            <Pencil size={14} />
          </button>
          <button onClick={onDelete} title="Delete" className="p-1.5 rounded-lg" style={{ color: "var(--text-tertiary)" }}>
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <p className="text-sm mt-2 whitespace-pre-wrap" style={{ color: "var(--text-secondary)" }}>
        {item.why}
      </p>
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
            className="text-[11px] font-medium rounded-full px-2.5 py-1 transition-colors"
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

export default function ThingsToLearnPage() {
  const { items, loading, createItem, updateItem, deleteItem } = useLearnItems();
  const { toast } = useToast();
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
            <GraduationCap size={22} style={{ color: "var(--accent)" }} /> Things to Learn
          </h1>
          <p className="text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>
            A learning backlog — topics parked until there&rsquo;s time.
          </p>
        </div>
        {!creating && (
          <button onClick={() => setCreating(true)} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium bg-sage-400 text-white hover:bg-sage-500 transition-colors">
            <Plus size={15} /> New item
          </button>
        )}
      </div>

      {creating && (
        <ItemEditor
          onSave={(data) => {
            createItem(data);
            setCreating(false);
            toast("Added to backlog");
          }}
          onCancel={() => setCreating(false)}
        />
      )}

      {items.length === 0 && !loading && !creating && (
        <div className="flex flex-col items-center justify-center py-16 rounded-xl text-center" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}>
          <GraduationCap size={48} style={{ color: "var(--text-tertiary)" }} className="mb-4" />
          <p className="text-lg font-medium" style={{ color: "var(--text-primary)" }}>Nothing parked yet</p>
          <p className="text-sm mt-1 mb-4 max-w-sm" style={{ color: "var(--text-secondary)" }}>
            Add a topic you want to learn or build, and note what pulled you toward it.
          </p>
          <button onClick={() => setCreating(true)} className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium bg-sage-400 text-white hover:bg-sage-500 transition-colors">
            <Plus size={15} /> New item
          </button>
        </div>
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

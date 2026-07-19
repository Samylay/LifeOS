"use client";

import { useState } from "react";
import { GraduationCap, Plus, Pencil, Trash2, X, Check } from "lucide-react";
import { useLearnItems } from "@/lib/use-learn-items";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import type { LearnItem, LearnStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";

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
    <Card className="gap-3 rounded-xl p-4 enter">
      <Input
        type="text"
        value={d.topic}
        onChange={(e) => set({ topic: e.target.value })}
        placeholder="Topic (e.g. Chess openings)…"
        autoFocus
        className="text-sm font-medium"
      />
      <Textarea
        value={d.why}
        onChange={(e) => set({ why: e.target.value })}
        rows={2}
        placeholder="Why — what pulled you toward it?"
        className="text-sm resize-none"
      />
      <Textarea
        value={d.firstStep || ""}
        onChange={(e) => set({ firstStep: e.target.value })}
        rows={2}
        placeholder="First step (optional) — smallest concrete entry point"
        className="text-sm resize-none"
      />
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
          Status
        </span>
        {STATUSES.map((s) => (
          <button
            key={s.status}
            onClick={() => set({ status: s.status })}
            className={cn(
              "text-xs font-medium rounded-full px-3 py-1 transition-transform duration-150 active:scale-[0.97]",
              d.status === s.status ? "text-white" : "text-muted-foreground bg-muted"
            )}
            style={d.status === s.status ? { background: s.color } : undefined}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2 justify-end">
        <Button variant="secondary" size="sm" onClick={onCancel} className="gap-1.5 text-xs">
          <X size={14} /> Cancel
        </Button>
        <Button
          size="sm"
          onClick={() => d.topic.trim() && onSave({ ...d, topic: d.topic.trim(), firstStep: d.firstStep?.trim() || undefined })}
          disabled={!d.topic.trim()}
          className="gap-1.5 text-sm px-4"
        >
          <Check size={14} /> Save
        </Button>
      </div>
    </Card>
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
    <Card className="gap-0 rounded-xl p-4 hover-lift">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <span
            className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
            style={{ background: `${meta.color}20`, color: meta.color }}
          >
            {meta.label}
          </span>
          <h3 className="text-base font-semibold mt-2 text-foreground">{item.topic}</h3>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button variant="ghost" size="icon-sm" onClick={onEdit} aria-label="Edit item" className="text-muted-foreground/70">
            <Pencil size={14} />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={onDelete} aria-label="Delete item" className="text-muted-foreground/70">
            <Trash2 size={14} />
          </Button>
        </div>
      </div>
      {item.why && (
        <p className="text-sm mt-2 whitespace-pre-wrap text-muted-foreground">{item.why}</p>
      )}
      {item.firstStep && (
        <p className="text-xs mt-2 text-muted-foreground/70">
          <span className="font-semibold uppercase tracking-wider">First step · </span>
          {item.firstStep}
        </p>
      )}
      <div className="mt-3 flex items-center gap-1.5 flex-wrap">
        {STATUSES.map((s) => (
          <button
            key={s.status}
            onClick={() => onStatus(s.status)}
            className={cn(
              "text-[11px] font-medium rounded-full px-2.5 py-1 transition-transform duration-150 active:scale-[0.97]",
              item.status === s.status ? "text-white" : "text-muted-foreground/70 bg-muted"
            )}
            style={item.status === s.status ? { background: s.color } : undefined}
          >
            {s.label}
          </button>
        ))}
      </div>
    </Card>
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
          <h2 className="text-lg font-semibold flex items-center gap-2 text-foreground">
            <GraduationCap size={18} className="text-primary" /> Learning backlog
          </h2>
          <p className="text-xs mt-0.5 text-muted-foreground/70">
            Topics parked until there&rsquo;s time to learn or build them.
          </p>
        </div>
        {!creating && (
          <Button size="sm" onClick={() => setCreating(true)} className="gap-1.5">
            <Plus size={15} /> New item
          </Button>
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
        <p className="text-sm text-muted-foreground/70">
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

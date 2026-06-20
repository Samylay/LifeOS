"use client";

import { useState } from "react";
import { Hammer, Plus, Pencil, Trash2, X, Check } from "lucide-react";
import { useWeekendProjects } from "@/lib/use-weekend-projects";
import { useToast } from "@/components/toast";
import { ConfirmDialog } from "@/components/confirm-dialog";
import type { WeekendProject, WeekendProjectStatus } from "@/lib/types";

const STATUSES: { status: WeekendProjectStatus; label: string; color: string }[] = [
  { status: "idea", label: "Idea", color: "#64748B" },
  { status: "active", label: "Active", color: "#7C9E8A" },
  { status: "done", label: "Done", color: "#6366F1" },
  { status: "shelved", label: "Shelved", color: "#F59E0B" },
];

const STATUS_META = Object.fromEntries(STATUSES.map((s) => [s.status, s])) as Record<
  WeekendProjectStatus,
  { status: WeekendProjectStatus; label: string; color: string }
>;

type Draft = Omit<WeekendProject, "id" | "createdAt" | "updatedAt">;

const EMPTY: Draft = {
  title: "",
  learningGoal: "",
  weekendScope: "",
  stretch: "",
  notes: "",
  status: "idea",
};

const inputStyle = {
  color: "var(--text-primary)",
  background: "var(--bg-tertiary)",
  border: "1px solid var(--border-primary)",
};

function ProjectEditor({
  initial,
  onSave,
  onCancel,
}: {
  initial?: WeekendProject;
  onSave: (data: Draft) => void;
  onCancel: () => void;
}) {
  const [d, setD] = useState<Draft>(initial ? { ...initial } : { ...EMPTY });
  const set = (patch: Partial<Draft>) => setD((prev) => ({ ...prev, ...patch }));

  const fields: { key: keyof Draft; label: string; rows: number; placeholder: string }[] = [
    { key: "learningGoal", label: "Learning goal", rows: 2, placeholder: "What black box does this open?" },
    { key: "weekendScope", label: "Weekend scope", rows: 2, placeholder: "Realistic 'done' for one weekend" },
    { key: "stretch", label: "Stretch", rows: 2, placeholder: "Optional deeper directions" },
    { key: "notes", label: "Notes", rows: 4, placeholder: "Language choice, resources, decisions" },
  ];

  return (
    <div className="rounded-xl p-4 space-y-3" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}>
      <input
        type="text"
        value={d.title}
        onChange={(e) => set({ title: e.target.value })}
        placeholder="Project title (e.g. Build your own Redis)…"
        autoFocus
        className="w-full text-sm font-medium outline-none rounded-lg px-3 py-2"
        style={inputStyle}
      />
      {fields.map((f) => (
        <div key={f.key}>
          <p className="text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-tertiary)" }}>
            {f.label}
          </p>
          <textarea
            value={d[f.key] as string}
            onChange={(e) => set({ [f.key]: e.target.value } as Partial<Draft>)}
            rows={f.rows}
            placeholder={f.placeholder}
            className="w-full text-sm outline-none rounded-lg px-3 py-2 resize-none"
            style={inputStyle}
          />
        </div>
      ))}

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
          onClick={() => d.title.trim() && onSave({ ...d, title: d.title.trim() })}
          disabled={!d.title.trim()}
          className="flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium bg-sage-400 text-white hover:bg-sage-500 transition-colors disabled:opacity-50"
        >
          <Check size={14} /> Save
        </button>
      </div>
    </div>
  );
}

function ProjectCard({
  project,
  onEdit,
  onDelete,
  onStatus,
}: {
  project: WeekendProject;
  onEdit: () => void;
  onDelete: () => void;
  onStatus: (s: WeekendProjectStatus) => void;
}) {
  const meta = STATUS_META[project.status];
  const rows: { label: string; value: string }[] = [
    { label: "Learning goal", value: project.learningGoal },
    { label: "Weekend scope", value: project.weekendScope },
    { label: "Stretch", value: project.stretch },
    { label: "Notes", value: project.notes },
  ];

  return (
    <div className="rounded-xl p-5" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full" style={{ background: `${meta.color}20`, color: meta.color }}>
            {meta.label}
          </span>
          <h2 className="text-lg font-semibold mt-2" style={{ color: "var(--text-primary)" }}>
            {project.title}
          </h2>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={onEdit} title="Edit" className="p-1.5 rounded-lg" style={{ color: "var(--text-tertiary)" }}>
            <Pencil size={15} />
          </button>
          <button onClick={onDelete} title="Delete" className="p-1.5 rounded-lg" style={{ color: "var(--text-tertiary)" }}>
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      {rows.map((r) =>
        r.value ? (
          <div key={r.label} className="mt-3">
            <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "var(--text-tertiary)" }}>
              {r.label}
            </p>
            <p className="text-sm whitespace-pre-wrap" style={{ color: "var(--text-secondary)" }}>
              {r.value}
            </p>
          </div>
        ) : null
      )}

      <div className="mt-4 flex items-center gap-1.5 flex-wrap">
        {STATUSES.map((s) => (
          <button
            key={s.status}
            onClick={() => onStatus(s.status)}
            className="text-[11px] font-medium rounded-full px-2.5 py-1 transition-colors"
            style={{
              color: project.status === s.status ? "#fff" : "var(--text-tertiary)",
              background: project.status === s.status ? s.color : "var(--bg-tertiary)",
            }}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function WeekendProjectsPage() {
  const { projects, loading, createProject, updateProject, deleteProject, seedDefaults } = useWeekendProjects();
  const { toast } = useToast();
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
            <Hammer size={22} style={{ color: "var(--accent)" }} /> Weekend Projects
          </h1>
          <p className="text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>
            Buildable, weekend-sized projects — each honest about scope, each with a real &ldquo;done.&rdquo;
          </p>
        </div>
        {!creating && (
          <button onClick={() => setCreating(true)} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium bg-sage-400 text-white hover:bg-sage-500 transition-colors">
            <Plus size={15} /> New project
          </button>
        )}
      </div>

      {creating && (
        <ProjectEditor
          onSave={(data) => {
            createProject(data);
            setCreating(false);
            toast("Project added");
          }}
          onCancel={() => setCreating(false)}
        />
      )}

      {projects.length === 0 && !loading && !creating && (
        <div className="flex flex-col items-center justify-center py-16 rounded-xl text-center" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}>
          <Hammer size={48} style={{ color: "var(--text-tertiary)" }} className="mb-4" />
          <p className="text-lg font-medium" style={{ color: "var(--text-primary)" }}>No projects yet</p>
          <p className="text-sm mt-1 mb-4 max-w-sm" style={{ color: "var(--text-secondary)" }}>
            Start with the seed entry (Build your own Redis), or add your own.
          </p>
          <button onClick={() => { seedDefaults(); toast("Seeded starter project"); }} className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium bg-sage-400 text-white hover:bg-sage-500 transition-colors">
            <Plus size={15} /> Add the seed entry
          </button>
        </div>
      )}

      <div className="space-y-4">
        {projects.map((p) =>
          editingId === p.id ? (
            <ProjectEditor
              key={p.id}
              initial={p}
              onSave={(data) => {
                updateProject(p.id, data);
                setEditingId(null);
              }}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <ProjectCard
              key={p.id}
              project={p}
              onEdit={() => setEditingId(p.id)}
              onDelete={() => setConfirmId(p.id)}
              onStatus={(s) => updateProject(p.id, { status: s })}
            />
          )
        )}
      </div>

      <ConfirmDialog
        open={confirmId !== null}
        title="Delete project?"
        message="This removes the project permanently."
        onConfirm={() => {
          if (confirmId) deleteProject(confirmId);
          setConfirmId(null);
        }}
        onCancel={() => setConfirmId(null)}
      />
    </div>
  );
}

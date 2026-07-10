"use client";

import { useState, useEffect, useRef } from "react";
import { FolderKanban, Plus, X, Archive, MoreHorizontal, AlertCircle, Rocket } from "lucide-react";
import { useProjects } from "@/lib/use-projects";
import { useShipLog } from "@/lib/use-ship-log";
import { useTasks } from "@/lib/use-tasks";
import { useToast } from "@/components/toast";
import { ConfirmDialog } from "@/components/confirm-dialog";
import type { Project, ProjectStatus, AreaId, Task, ShipLogEntry } from "@/lib/types";
import { AREAS } from "@/lib/types";
import { TaskItem, TaskCreateForm } from "@/components/task-list";

// --- Status columns ---

const STATUS_COLUMNS: { status: ProjectStatus; label: string; color: string }[] = [
  { status: "planning", label: "Planning", color: "#64748B" },
  { status: "active", label: "Active", color: "#7C9E8A" },
  { status: "paused", label: "Paused", color: "#F59E0B" },
  { status: "completed", label: "Completed", color: "#6366F1" },
];

const AREA_COLORS: Record<string, string> = {
  health: "#14B8A6",
  career: "#6366F1",
  finance: "#F59E0B",
  brand: "#8B5CF6",
  admin: "#64748B",
};

// --- Weekly Review Banner ---

function WeeklyReviewBanner({ projects, tasks, onDismiss }: {
  projects: Project[];
  tasks: Task[];
  onDismiss: () => void;
}) {
  const activeProjects = projects.filter((p) => p.status === "active" || p.status === "planning");
  const staleProjects = activeProjects.filter((p) => {
    const projectTasks = tasks.filter((t) => t.projectId === p.id);
    const allDone = projectTasks.length > 0 && projectTasks.every((t) => t.status === "done");
    const noNextAction = !p.nextAction;
    return allDone || (noNextAction && projectTasks.length === 0);
  });

  if (staleProjects.length === 0) return null;

  return (
    <div className="rounded-xl p-4 mb-6" style={{ background: "#F59E0B10", border: "1px solid #F59E0B40" }}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <AlertCircle size={16} style={{ color: "#F59E0B" }} />
          <h3 className="text-sm font-semibold" style={{ color: "#F59E0B" }}>Weekly Review</h3>
        </div>
        <button onClick={onDismiss} className="p-0.5" style={{ color: "var(--text-tertiary)" }}><X size={14} /></button>
      </div>
      <p className="text-xs mb-3" style={{ color: "var(--text-secondary)" }}>
        These projects need attention - no next action or all tasks complete:
      </p>
      <div className="space-y-2">
        {staleProjects.map((p) => (
          <div key={p.id} className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: "var(--bg-secondary)" }}>
            <span className="flex-1 text-sm" style={{ color: "var(--text-primary)" }}>{p.title}</span>
            <span className="text-xs" style={{ color: "#F59E0B" }}>
              {!p.nextAction ? "No next action" : "All tasks done"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Create Form ---

function ProjectCreateForm({ onSubmit, onCancel }: { onSubmit: (data: Omit<Project, "id" | "createdAt">) => void; onCancel: () => void }) {
  const [title, setTitle] = useState("");
  const [area, setArea] = useState<AreaId | "">("");
  const [status, setStatus] = useState<ProjectStatus>("planning");
  const [nextAction, setNextAction] = useState("");
  const [shippingEvent, setShippingEvent] = useState("");
  const [targetDate, setTargetDate] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSubmit({
      title: title.trim(),
      area: area || undefined,
      status,
      nextAction: nextAction.trim() || undefined,
      shippingEvent: shippingEvent.trim() || undefined,
      targetDate: targetDate ? new Date(targetDate) : undefined,
      linkedTaskIds: [],
    });
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-xl p-4 space-y-3" style={{ background: "var(--bg-secondary)", border: "1px solid var(--accent)" }}>
      <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Project title..."
        autoFocus className="w-full bg-transparent text-sm font-medium outline-none" style={{ color: "var(--text-primary)" }} />
      <input type="text" value={nextAction} onChange={(e) => setNextAction(e.target.value)} placeholder="Next action..."
        className="w-full bg-transparent text-xs outline-none" style={{ color: "var(--text-secondary)" }} />
      <input type="text" value={shippingEvent} onChange={(e) => setShippingEvent(e.target.value)}
        placeholder="Shipping event — what leaves the machine, to whom? (required to be Active)"
        className="w-full bg-transparent text-xs outline-none" style={{ color: "var(--text-secondary)" }} />
      <div className="flex flex-wrap items-center gap-2">
        <select value={area} onChange={(e) => setArea(e.target.value as AreaId | "")}
          className="text-xs rounded-lg px-2 py-1.5 outline-none"
          style={{ background: "var(--bg-tertiary)", color: "var(--text-primary)", border: "1px solid var(--border-primary)" }}>
          <option value="">No area</option>
          {Object.entries(AREAS).map(([id, a]) => (<option key={id} value={id}>{a.name}</option>))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus)}
          className="text-xs rounded-lg px-2 py-1.5 outline-none"
          style={{ background: "var(--bg-tertiary)", color: "var(--text-primary)", border: "1px solid var(--border-primary)" }}>
          {STATUS_COLUMNS.map((col) => (<option key={col.status} value={col.status}>{col.label}</option>))}
        </select>
        <input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)}
          className="text-xs rounded-lg px-2 py-1.5 outline-none"
          style={{ background: "var(--bg-tertiary)", color: "var(--text-primary)", border: "1px solid var(--border-primary)" }} />
        <div className="flex-1" />
        <button type="button" onClick={onCancel} className="text-xs px-3 py-1.5 rounded-lg" style={{ color: "var(--text-secondary)" }}>Cancel</button>
        <button type="submit" className="text-xs px-3 py-1.5 rounded-lg bg-sage-400 text-white hover:bg-sage-500 transition-colors font-medium">Create</button>
      </div>
    </form>
  );
}

// --- Project Card ---

function ProjectCard({
  project, tasks, onUpdate, onDelete, onTaskUpdate, onTaskDelete, onTaskCreate,
}: {
  project: Project;
  tasks: Task[];
  onUpdate: (id: string, data: Partial<Project>) => void;
  onDelete: (id: string) => void;
  onTaskUpdate: (id: string, data: Partial<Task>) => void;
  onTaskDelete: (id: string) => void;
  onTaskCreate: (data: Omit<Task, "id" | "createdAt" | "updatedAt">) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showMenu]);

  const projectTasks = tasks.filter((t) => t.projectId === project.id);
  const doneTasks = projectTasks.filter((t) => t.status === "done").length;
  const totalTasks = projectTasks.length;
  const progress = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  return (
    <div
      className="rounded-xl transition-[background,border-color]"
      style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}
    >
      <div className="p-4 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-start justify-between mb-2">
          <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{project.title}</h3>
          <div className="flex items-center gap-1">
            <span className="text-xs px-2 py-0.5 rounded-full capitalize"
              style={{
                background: `${STATUS_COLUMNS.find((c) => c.status === project.status)?.color || "#64748B"}20`,
                color: STATUS_COLUMNS.find((c) => c.status === project.status)?.color || "#64748B",
              }}>
              {project.status}
            </span>
            <div className="relative" ref={menuRef}>
              <button onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
                className="p-1 rounded" style={{ color: "var(--text-tertiary)" }}>
                <MoreHorizontal size={14} />
              </button>
              {showMenu && (
                <div className="absolute right-0 top-full mt-1 rounded-lg shadow-lg py-1 z-50 min-w-[140px]"
                  style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}>
                  {STATUS_COLUMNS.map((col) => (
                    <button key={col.status}
                      onClick={(e) => { e.stopPropagation(); onUpdate(project.id, { status: col.status }); setShowMenu(false); }}
                      className="w-full text-left text-xs px-3 py-1.5 hover:opacity-80"
                      style={{ color: col.color }}>
                      {col.label}
                    </button>
                  ))}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowMenu(false);
                      // Kills are fine, but they're a decision: in-flight
                      // projects don't get archived without a logged reason.
                      const inFlight = project.status === "active" || project.status === "planning";
                      let killReason: string | undefined;
                      if (inFlight) {
                        const reason = window.prompt("One-line reason for killing this project:");
                        if (reason === null) return;
                        killReason = reason.trim() || undefined;
                      }
                      onUpdate(project.id, { status: "archived" as ProjectStatus, ...(killReason ? { killReason } : {}) });
                    }}
                    className="w-full text-left text-xs px-3 py-1.5 hover:opacity-80 flex items-center gap-2"
                    style={{ color: "var(--text-tertiary)" }}>
                    <Archive size={12} /> Archive
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); setShowMenu(false); }}
                    className="w-full text-left text-xs px-3 py-1.5 hover:opacity-80"
                    style={{ color: "#EF4444" }}>
                    Delete
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {project.area && (
          <span className="text-xs px-1.5 py-0.5 rounded inline-block mb-2"
            style={{ background: `${AREA_COLORS[project.area] || "#64748B"}15`, color: AREA_COLORS[project.area] || "#64748B" }}>
            {AREAS[project.area]?.name}
          </span>
        )}

        <div className="mb-2">
          <div className="flex justify-between mb-1">
            <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>Progress</span>
            <span className="text-xs font-mono" style={{ color: "var(--accent)" }}>{progress}%</span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-tertiary)" }}>
            <div className="h-full w-full rounded-full origin-left transition-transform" style={{ transform: `scaleX(${progress / 100})`, background: "var(--accent)" }} />
          </div>
        </div>

        {project.nextAction && (
          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
            Next: {project.nextAction}
          </p>
        )}
        {project.shippingEvent ? (
          <p className="text-xs mt-1 flex items-center gap-1" style={{ color: "var(--text-secondary)" }}>
            <Rocket size={11} style={{ color: "var(--accent)", flexShrink: 0 }} />
            Ships: {project.shippingEvent}
          </p>
        ) : (project.status === "active" || project.status === "planning") && (
          <p className="text-xs mt-1" style={{ color: "#F59E0B" }}>
            No shipping event — what leaves the machine, and to whom?
          </p>
        )}
        {project.targetDate && (
          <p className="text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>
            Target: {new Date(project.targetDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </p>
        )}
      </div>

      {expanded && (
        <div className="px-4 pb-4 border-t" style={{ borderColor: "var(--border-primary)" }}>
          <div className="flex items-center justify-between mt-3 mb-2">
            <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
              Linked Tasks ({totalTasks})
            </span>
            <button onClick={() => setShowTaskForm(true)} className="text-xs px-2 py-1 rounded bg-sage-400 text-white">
              <Plus size={12} className="inline mr-1" />Add
            </button>
          </div>
          {showTaskForm && (
            <div className="mb-2">
              <TaskCreateForm
                onSubmit={(data) => {
                  onTaskCreate({ ...data, projectId: project.id });
                  setShowTaskForm(false);
                }}
                onCancel={() => setShowTaskForm(false)}
              />
            </div>
          )}
          <div className="space-y-1">
            {projectTasks.length === 0 && !showTaskForm && (
              <p className="text-xs py-2 text-center" style={{ color: "var(--text-tertiary)" }}>No linked tasks.</p>
            )}
            {projectTasks.map((task) => (
              <TaskItem key={task.id} task={task} onUpdate={onTaskUpdate} onDelete={onTaskDelete} />
            ))}
          </div>
        </div>
      )}
      <ConfirmDialog
        open={confirmDelete}
        title="Delete Project"
        message={`Delete "${project.title}" and all its data? This cannot be undone.`}
        onConfirm={() => { onDelete(project.id); setConfirmDelete(false); }}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}

// --- Ship Log ---
// One row per thing that left the machine. Predicted vs. actual reaction is
// the belief-updating column — entries stay "awaiting reality" until filled.

const DAY_MS = 86_400_000;

function ShipLogSection({ entries, projects, onLog, onUpdate }: {
  entries: ShipLogEntry[];
  projects: Project[];
  onLog: (data: Omit<ShipLogEntry, "id" | "createdAt">) => Promise<unknown>;
  onUpdate: (id: string, data: Partial<ShipLogEntry>) => Promise<void>;
}) {
  const [showForm, setShowForm] = useState(false);
  const [what, setWhat] = useState("");
  const [toWhom, setToWhom] = useState("");
  const [predicted, setPredicted] = useState("");
  const [projectId, setProjectId] = useState("");
  const [actualDrafts, setActualDrafts] = useState<Record<string, string>>({});
  // Snapshot: the 30-day window doesn't need to tick while the page is open.
  const [now] = useState(() => Date.now());

  const shipped30 = entries.filter((e) => now - new Date(e.date).getTime() <= 30 * DAY_MS).length;
  const projectTitle = (id?: string) => projects.find((p) => p.id === id)?.title;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!what.trim() || !toWhom.trim()) return;
    await onLog({
      date: new Date(),
      what: what.trim(),
      toWhom: toWhom.trim(),
      predictedReaction: predicted.trim() || "(none recorded)",
      projectId: projectId || undefined,
    });
    setWhat(""); setToWhom(""); setPredicted(""); setProjectId("");
    setShowForm(false);
  };

  const saveActual = async (id: string) => {
    const text = actualDrafts[id]?.trim();
    if (!text) return;
    await onUpdate(id, { actualReaction: text });
    setActualDrafts((d) => ({ ...d, [id]: "" }));
  };

  return (
    <div className="mt-10">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Rocket size={16} style={{ color: "var(--accent)" }} />
          <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Ship Log</h2>
          <span className="text-xs px-2 py-0.5 rounded-full font-mono"
            style={{
              background: shipped30 === 0 ? "#EF444420" : "var(--bg-tertiary)",
              color: shipped30 === 0 ? "#EF4444" : "var(--text-secondary)",
            }}>
            {shipped30} shipped / 30d
          </span>
        </div>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-sage-400 text-white hover:bg-sage-500 transition-colors font-medium">
          <Plus size={12} /> Log a ship
        </button>
      </div>

      {shipped30 === 0 && entries.length === 0 && !showForm && (
        <p className="text-xs mb-3" style={{ color: "var(--text-tertiary)" }}>
          Nothing has left the machine yet. Progress here beats progress on the tracker.
        </p>
      )}

      {showForm && (
        <form onSubmit={submit} className="rounded-xl p-4 space-y-3 mb-4"
          style={{ background: "var(--bg-secondary)", border: "1px solid var(--accent)" }}>
          <input type="text" value={what} onChange={(e) => setWhat(e.target.value)} autoFocus
            placeholder="What shipped? (rough is fine — it left the machine)"
            className="w-full bg-transparent text-sm font-medium outline-none" style={{ color: "var(--text-primary)" }} />
          <input type="text" value={toWhom} onChange={(e) => setToWhom(e.target.value)}
            placeholder="To whom? (a person, a public post, a deploy someone was told about)"
            className="w-full bg-transparent text-xs outline-none" style={{ color: "var(--text-secondary)" }} />
          <input type="text" value={predicted} onChange={(e) => setPredicted(e.target.value)}
            placeholder="Predicted reaction — write it down before reality answers"
            className="w-full bg-transparent text-xs outline-none" style={{ color: "var(--text-secondary)" }} />
          <div className="flex items-center gap-2">
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)}
              className="text-xs rounded-lg px-2 py-1.5 outline-none"
              style={{ background: "var(--bg-tertiary)", color: "var(--text-primary)", border: "1px solid var(--border-primary)" }}>
              <option value="">No project</option>
              {projects.filter((p) => p.status !== "archived").map((p) => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>
            <div className="flex-1" />
            <button type="button" onClick={() => setShowForm(false)}
              className="text-xs px-3 py-1.5 rounded-lg" style={{ color: "var(--text-secondary)" }}>Cancel</button>
            <button type="submit"
              className="text-xs px-3 py-1.5 rounded-lg bg-sage-400 text-white hover:bg-sage-500 transition-colors font-medium">Log it</button>
          </div>
        </form>
      )}

      <div className="space-y-2">
        {entries.map((entry) => {
          const awaiting = !entry.actualReaction;
          return (
            <div key={entry.id} className="rounded-xl p-4"
              style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}>
              <div className="flex items-start justify-between gap-2 mb-1">
                <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{entry.what}</p>
                <span className="text-xs font-mono flex-shrink-0" style={{ color: "var(--text-tertiary)" }}>
                  {new Date(entry.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </span>
              </div>
              <p className="text-xs mb-2" style={{ color: "var(--text-secondary)" }}>
                → {entry.toWhom}
                {projectTitle(entry.projectId) && (
                  <span className="ml-2 px-1.5 py-0.5 rounded" style={{ background: "var(--bg-tertiary)", color: "var(--text-tertiary)" }}>
                    {projectTitle(entry.projectId)}
                  </span>
                )}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg px-3 py-2" style={{ background: "var(--bg-tertiary)" }}>
                  <span style={{ color: "var(--text-tertiary)" }}>Predicted: </span>
                  <span style={{ color: "var(--text-secondary)" }}>{entry.predictedReaction}</span>
                </div>
                <div className="rounded-lg px-3 py-2"
                  style={{ background: awaiting ? "#F59E0B10" : "var(--bg-tertiary)", border: awaiting ? "1px solid #F59E0B40" : "none" }}>
                  {awaiting ? (
                    <div className="flex items-center gap-2">
                      <input type="text" value={actualDrafts[entry.id] || ""}
                        onChange={(e) => setActualDrafts((d) => ({ ...d, [entry.id]: e.target.value }))}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); saveActual(entry.id); } }}
                        placeholder="Actual reaction — what really happened?"
                        className="flex-1 bg-transparent outline-none" style={{ color: "var(--text-primary)" }} />
                      <button onClick={() => saveActual(entry.id)} className="flex-shrink-0" style={{ color: "#F59E0B" }}>
                        Save
                      </button>
                    </div>
                  ) : (
                    <>
                      <span style={{ color: "var(--text-tertiary)" }}>Actual: </span>
                      <span style={{ color: "var(--text-secondary)" }}>{entry.actualReaction}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --- Main Page ---

export default function ProjectsPage() {
  const { projects, loading, createProject, updateProject, deleteProject } = useProjects();
  const { entries: shipLog, logShip, updateEntry } = useShipLog();
  const { tasks, updateTask, deleteTask, createTask } = useTasks();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [viewMode, setViewMode] = useState<"kanban" | "list">("kanban");
  const [reviewDismissed, setReviewDismissed] = useState(false);

  // Invariant violations (missing shipping event, WIP limit) reject the write;
  // surface them instead of swallowing the rejection.
  const handleProjectUpdate = async (id: string, data: Partial<Project>) => {
    try {
      await updateProject(id, data);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Update failed");
    }
  };

  const handleProjectCreate = async (data: Omit<Project, "id" | "createdAt">) => {
    try {
      await createProject(data);
      setShowForm(false);
      toast("Project created");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Create failed");
    }
  };

  const activeProjects = projects.filter((p) => p.status !== "archived");

  // Show review banner on Sundays and Mondays
  const dayOfWeek = new Date().getDay();
  const isReviewDay = dayOfWeek === 0 || dayOfWeek === 1;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>Projects</h1>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg overflow-hidden" style={{ border: "1px solid var(--border-primary)" }}>
            <button
              onClick={() => setViewMode("kanban")}
              className="px-3 py-1.5 text-xs font-medium transition-colors"
              style={{ background: viewMode === "kanban" ? "var(--accent)" : "transparent", color: viewMode === "kanban" ? "white" : "var(--text-secondary)" }}>
              Board
            </button>
            <button
              onClick={() => setViewMode("list")}
              className="px-3 py-1.5 text-xs font-medium transition-colors"
              style={{ background: viewMode === "list" ? "var(--accent)" : "transparent", color: viewMode === "list" ? "white" : "var(--text-secondary)" }}>
              List
            </button>
          </div>
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium bg-sage-400 text-white hover:bg-sage-500 transition-colors">
            <Plus size={16} /> New Project
          </button>
        </div>
      </div>

      {isReviewDay && !reviewDismissed && (
        <WeeklyReviewBanner projects={projects} tasks={tasks} onDismiss={() => setReviewDismissed(true)} />
      )}

      {showForm && (
        <div className="mb-6">
          <ProjectCreateForm
            onSubmit={handleProjectCreate}
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}

      {activeProjects.length === 0 && !showForm ? (
        <div className="flex flex-col items-center justify-center py-16 rounded-xl"
          style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}>
          <FolderKanban size={48} style={{ color: "var(--text-tertiary)" }} className="mb-4" />
          <p className="text-lg font-medium" style={{ color: "var(--text-primary)" }}>No projects yet</p>
          <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>Create your first project to start tracking progress.</p>
        </div>
      ) : viewMode === "kanban" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {STATUS_COLUMNS.map((col) => {
            const colProjects = activeProjects.filter((p) => p.status === col.status);
            return (
              <div key={col.status}>
                <div className="flex items-center gap-2 mb-3">
                  <div className="h-2 w-2 rounded-full" style={{ background: col.color }} />
                  <h2 className="text-xs font-semibold uppercase tracking-wider" style={{ color: col.color }}>
                    {col.label}
                  </h2>
                  <span className="text-xs font-mono" style={{ color: "var(--text-tertiary)" }}>
                    {colProjects.length}
                  </span>
                </div>
                <div className="space-y-3">
                  {colProjects.map((project) => (
                    <ProjectCard key={project.id} project={project} tasks={tasks}
                      onUpdate={handleProjectUpdate} onDelete={deleteProject}
                      onTaskUpdate={updateTask} onTaskDelete={deleteTask} onTaskCreate={createTask} />
                  ))}
                  {colProjects.length === 0 && (
                    <div className="rounded-lg py-8 text-center" style={{ border: "1px dashed var(--border-primary)" }}>
                      <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>No projects</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-3">
          {activeProjects.map((project) => (
            <ProjectCard key={project.id} project={project} tasks={tasks}
              onUpdate={handleProjectUpdate} onDelete={deleteProject}
              onTaskUpdate={updateTask} onTaskDelete={deleteTask} onTaskCreate={createTask} />
          ))}
        </div>
      )}

      <ShipLogSection entries={shipLog} projects={projects} onLog={logShip} onUpdate={updateEntry} />
    </div>
  );
}

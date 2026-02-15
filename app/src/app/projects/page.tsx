"use client";

import { useState } from "react";
import { FolderKanban, Plus, X, ChevronRight, Archive, RotateCcw, MoreHorizontal } from "lucide-react";
import { useProjects } from "@/lib/use-projects";
import { useTasks } from "@/lib/use-tasks";
import type { Project, ProjectStatus, AreaId, Task } from "@/lib/types";
import { AREAS } from "@/lib/types";
import { TaskItem, TaskCreateForm } from "@/components/task-list";

// --- Status columns ---

const STATUS_COLUMNS: { status: ProjectStatus; label: string; color: string }[] = [
  { status: "planning", label: "Planning", color: "#64748B" },
  { status: "active", label: "Active", color: "#10B981" },
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

// --- Create Form ---

function ProjectCreateForm({ onSubmit, onCancel }: { onSubmit: (data: Omit<Project, "id" | "createdAt">) => void; onCancel: () => void }) {
  const [title, setTitle] = useState("");
  const [area, setArea] = useState<AreaId | "">("");
  const [status, setStatus] = useState<ProjectStatus>("planning");
  const [nextAction, setNextAction] = useState("");
  const [targetDate, setTargetDate] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSubmit({
      title: title.trim(),
      area: area || undefined,
      status,
      nextAction: nextAction.trim() || undefined,
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
        <button type="submit" className="text-xs px-3 py-1.5 rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 transition-colors font-medium">Create</button>
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

  const projectTasks = tasks.filter((t) => t.projectId === project.id);
  const doneTasks = projectTasks.filter((t) => t.status === "done").length;
  const totalTasks = projectTasks.length;
  const progress = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  return (
    <div
      className="rounded-xl overflow-hidden transition-all"
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
            <div className="relative">
              <button onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
                className="p-1 rounded" style={{ color: "var(--text-tertiary)" }}>
                <MoreHorizontal size={14} />
              </button>
              {showMenu && (
                <div className="absolute right-0 top-full mt-1 rounded-lg shadow-lg py-1 z-20 min-w-[140px]"
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
                    onClick={(e) => { e.stopPropagation(); onUpdate(project.id, { status: "archived" as ProjectStatus }); setShowMenu(false); }}
                    className="w-full text-left text-xs px-3 py-1.5 hover:opacity-80 flex items-center gap-2"
                    style={{ color: "var(--text-tertiary)" }}>
                    <Archive size={12} /> Archive
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onDelete(project.id); setShowMenu(false); }}
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

        {/* Progress bar */}
        <div className="mb-2">
          <div className="flex justify-between mb-1">
            <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>Progress</span>
            <span className="text-xs font-mono" style={{ color: "var(--accent)" }}>{progress}%</span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-tertiary)" }}>
            <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, background: "var(--accent)" }} />
          </div>
        </div>

        {project.nextAction && (
          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
            Next: {project.nextAction}
          </p>
        )}
        {project.targetDate && (
          <p className="text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>
            Target: {new Date(project.targetDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </p>
        )}
      </div>

      {/* Expanded: linked tasks */}
      {expanded && (
        <div className="px-4 pb-4 border-t" style={{ borderColor: "var(--border-primary)" }}>
          <div className="flex items-center justify-between mt-3 mb-2">
            <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
              Linked Tasks ({totalTasks})
            </span>
            <button onClick={() => setShowTaskForm(true)} className="text-xs px-2 py-1 rounded bg-emerald-500 text-white">
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
    </div>
  );
}

// --- Main Page ---

export default function ProjectsPage() {
  const { projects, loading, createProject, updateProject, deleteProject } = useProjects();
  const { tasks, updateTask, deleteTask, createTask } = useTasks();
  const [showForm, setShowForm] = useState(false);
  const [viewMode, setViewMode] = useState<"kanban" | "list">("kanban");

  const activeProjects = projects.filter((p) => p.status !== "archived");

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
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium bg-emerald-500 text-white hover:bg-emerald-600 transition-colors">
            <Plus size={16} /> New Project
          </button>
        </div>
      </div>

      {showForm && (
        <div className="mb-6">
          <ProjectCreateForm
            onSubmit={(data) => { createProject(data); setShowForm(false); }}
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
                      onUpdate={updateProject} onDelete={deleteProject}
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
              onUpdate={updateProject} onDelete={deleteProject}
              onTaskUpdate={updateTask} onTaskDelete={deleteTask} onTaskCreate={createTask} />
          ))}
        </div>
      )}
    </div>
  );
}

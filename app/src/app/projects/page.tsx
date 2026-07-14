"use client";

import { useState, useEffect, useRef } from "react";
import {
  FolderKanban, Plus, Archive, MoreHorizontal, Rocket,
  ChevronDown, ChevronUp, AlertTriangle, Gauge, CalendarClock,
} from "lucide-react";
import { useProjects, WIP_LIMIT } from "@/lib/use-projects";
import { useShipLog } from "@/lib/use-ship-log";
import { useTasks } from "@/lib/use-tasks";
import { useToast } from "@/components/toast";
import { Skeleton } from "@/components/skeleton";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { CountUp } from "@/components/count-up";
import type { Project, ProjectStatus, AreaId, Task, ShipLogEntry } from "@/lib/types";
import { AREAS } from "@/lib/types";
import { TaskItem, TaskCreateForm } from "@/components/task-list";

// --- Status metadata ---

const STATUS_COLUMNS: { status: ProjectStatus; label: string; color: string }[] = [
  { status: "planning", label: "Planning", color: "#64748B" },
  { status: "active", label: "Active", color: "#7C9E8A" },
  { status: "paused", label: "Paused", color: "#F59E0B" },
  { status: "completed", label: "Completed", color: "#6366F1" },
];
const statusMeta = (s: ProjectStatus) => STATUS_COLUMNS.find((c) => c.status === s);

const AREA_COLORS: Record<string, string> = {
  health: "#14B8A6",
  career: "#6366F1",
  finance: "#F59E0B",
  brand: "#8B5CF6",
  admin: "#64748B",
};

const DAY_MS = 86_400_000;
const daysSince = (d: Date) => Math.floor((Date.now() - new Date(d).getTime()) / DAY_MS);

// A project that's meant to be in flight but hasn't named its exit point (or
// has run its task list dry) is drifting — the thing exit-velocity guards
// against. Return the one-line prompt, or null if it's healthy.
function looseEnd(p: Project, projectTasks: Task[]): string | null {
  if (p.status !== "active" && p.status !== "planning") return null;
  if (!p.shippingEvent?.trim()) return "No shipping event — what leaves the machine?";
  if (projectTasks.length > 0 && projectTasks.every((t) => t.status === "done"))
    return "All tasks done — ship it or close it out.";
  return null;
}

// --- Momentum bar ---
// The page's anchor: WIP against the limit, and whether things are actually
// leaving the machine. Shipping beats grooming, so this sits above the list.

function MomentumBar({
  activeCount, shipped30, lastShip,
}: {
  activeCount: number;
  shipped30: number;
  lastShip: Date | null;
}) {
  const atLimit = activeCount >= WIP_LIMIT;
  const sinceShip = lastShip ? daysSince(lastShip) : null;
  const cold = sinceShip === null || sinceShip > 7;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {/* WIP gauge */}
      <StatTile
        delay={0}
        icon={<Gauge size={18} style={{ color: atLimit ? "#F59E0B" : "var(--accent)" }} />}
        accent={atLimit ? "#F59E0B" : "var(--accent)"}
        alert={atLimit}
        stat={
          <>
            <CountUp value={activeCount} />
            <span className="text-base font-normal align-baseline" style={{ color: "var(--text-tertiary)" }}>/{WIP_LIMIT}</span>
          </>
        }
        label="active"
      >
        <div className="flex items-center gap-1 mt-2" aria-hidden>
          {Array.from({ length: WIP_LIMIT }).map((_, i) => (
            <span
              key={i}
              className="h-1.5 flex-1 rounded-full"
              style={{
                background: i < activeCount ? (atLimit ? "#F59E0B" : "var(--accent)") : "var(--bg-tertiary)",
                transform: "scaleY(1)",
                transformOrigin: "left",
                transition: "background-color var(--dur-base) var(--ease-out-custom)",
              }}
            />
          ))}
        </div>
      </StatTile>

      {/* Shipped / 30d */}
      <StatTile
        delay={40}
        icon={<Rocket size={18} style={{ color: shipped30 === 0 ? "#EF4444" : "var(--accent)" }} />}
        accent={shipped30 === 0 ? "#EF4444" : "var(--accent)"}
        alert={shipped30 === 0}
        stat={<CountUp value={shipped30} />}
        label="shipped / 30d"
        sub="things that left the machine"
      />

      {/* Days since last ship */}
      <StatTile
        delay={80}
        icon={<CalendarClock size={18} style={{ color: cold ? "#EF4444" : "var(--accent)" }} />}
        accent={cold ? "#EF4444" : "var(--accent)"}
        alert={cold}
        stat={sinceShip === null ? "—" : <CountUp value={sinceShip} suffix="d" />}
        label="since last ship"
        sub={sinceShip === null ? "nothing logged yet" : "keep the streak warm"}
      />
    </div>
  );
}

// Shared stat tile for the momentum bar. Number is the hero; a left accent
// rail carries the health color (calm accent / red-amber alert). Staggered
// .enter on mount, hover-lift for a touch of life. Non-interactive by design
// (these are readouts, not links) so no press feedback.
function StatTile({
  icon, accent, alert, stat, label, sub, delay, children,
}: {
  icon: React.ReactNode;
  accent: string;
  alert: boolean;
  stat: React.ReactNode;
  label: string;
  sub?: string;
  delay: number;
  children?: React.ReactNode;
}) {
  return (
    <div
      className="enter hover-lift relative min-w-0 overflow-hidden rounded-xl p-4 pl-5"
      style={{
        background: "var(--bg-secondary)",
        border: "1px solid var(--border-primary)",
        ["--enter-delay" as string]: `${delay}ms`,
      }}
    >
      {/* Health rail */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-1"
        style={{ background: accent, opacity: alert ? 0.9 : 0.5 }}
      />
      <div className="flex items-start gap-3">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-lg shrink-0"
          style={{ background: alert ? `${accent === "var(--accent)" ? "var(--accent-bg)" : accent + "18"}` : "var(--accent-bg)" }}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-2xl font-semibold leading-none tracking-tight tabular-nums" style={{ color: "var(--text-primary)" }}>
            {stat}
          </p>
          <p className="text-xs mt-1.5 font-medium" style={{ color: "var(--text-secondary)" }}>{label}</p>
          {sub && <p className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>{sub}</p>}
          {children}
        </div>
      </div>
    </div>
  );
}

// --- Loose ends (always-on staleness, replaces the Sun/Mon-only banner) ---

function LooseEnds({ items }: { items: { project: Project; reason: string }[] }) {
  if (items.length === 0) return null;
  return (
    <div className="rounded-xl p-4" style={{ background: "#F59E0B0D", border: "1px solid #F59E0B33" }}>
      <div className="flex items-center gap-2 mb-2.5">
        <AlertTriangle size={14} style={{ color: "#F59E0B" }} />
        <h2 className="text-xs font-bold uppercase tracking-widest" style={{ color: "#F59E0B" }}>
          Loose ends ({items.length})
        </h2>
      </div>
      <div className="space-y-1.5">
        {items.map(({ project, reason }) => (
          <div key={project.id} className="flex items-center gap-2 rounded-lg px-3 py-2"
            style={{ background: "var(--bg-secondary)" }}>
            <span className="flex-1 min-w-0 text-sm truncate" style={{ color: "var(--text-primary)" }}>{project.title}</span>
            <span className="text-xs shrink-0 text-right" style={{ color: "#F59E0B" }}>{reason}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Create form ---

function ProjectCreateForm({ onSubmit, onCancel }: { onSubmit: (data: Omit<Project, "id" | "createdAt" | "updatedAt">) => void; onCancel: () => void }) {
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

  const field = { background: "var(--bg-tertiary)", color: "var(--text-primary)", border: "1px solid var(--border-primary)" } as const;

  return (
    <form onSubmit={handleSubmit} className="rounded-xl p-4 space-y-3 enter" style={{ background: "var(--bg-secondary)", border: "1px solid var(--accent)" }}>
      <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Project title..."
        autoFocus className="w-full text-sm font-medium outline-none rounded-lg px-3 py-2" style={field} />
      <input type="text" value={nextAction} onChange={(e) => setNextAction(e.target.value)} placeholder="Next action..."
        className="w-full text-xs outline-none rounded-lg px-3 py-2" style={field} />
      <input type="text" value={shippingEvent} onChange={(e) => setShippingEvent(e.target.value)}
        placeholder="Shipping event — what leaves the machine, to whom? (required to be Active)"
        className="w-full text-xs outline-none rounded-lg px-3 py-2" style={field} />
      <div className="flex flex-wrap items-center gap-2">
        <select value={area} onChange={(e) => setArea(e.target.value as AreaId | "")}
          className="text-xs rounded-lg px-2 py-1.5 outline-none" style={field}>
          <option value="">No area</option>
          {Object.entries(AREAS).map(([id, a]) => (<option key={id} value={id}>{a.name}</option>))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus)}
          className="text-xs rounded-lg px-2 py-1.5 outline-none" style={field}>
          {STATUS_COLUMNS.map((col) => (<option key={col.status} value={col.status}>{col.label}</option>))}
        </select>
        <input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)}
          className="text-xs rounded-lg px-2 py-1.5 outline-none" style={field} />
        <div className="flex-1" />
        <button type="button" onClick={onCancel} className="text-xs px-3 py-1.5 rounded-lg transition-transform duration-150 active:scale-[0.97]" style={{ color: "var(--text-secondary)", background: "var(--bg-tertiary)" }}>Cancel</button>
        <button type="submit" className="text-xs px-3 py-1.5 rounded-lg bg-sage-400 text-white hover:bg-sage-500 transition-colors font-medium active:scale-[0.97]">Create</button>
      </div>
    </form>
  );
}

// --- Project Card ---

function ProjectCard({
  project, tasks, lastShip, hero, onUpdate, onDelete, onTaskUpdate, onTaskDelete, onTaskCreate,
}: {
  project: Project;
  tasks: Task[];
  lastShip: Date | null;
  hero?: boolean;
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
  const meta = statusMeta(project.status);
  const drift = looseEnd(project, projectTasks);
  const sinceShip = lastShip ? daysSince(lastShip) : null;

  return (
    <div className="rounded-xl hover-lift"
      style={{ background: "var(--bg-secondary)", border: hero ? "1px solid var(--accent)" : "1px solid var(--border-primary)" }}>
      <div className="flex items-start gap-2 p-4">
        {/* Toggle surface — a real button, keyboard-operable */}
        <button
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
          className="flex-1 min-w-0 text-left rounded-lg transition-transform duration-150 active:scale-[0.99]"
        >
          <div className="flex items-center gap-2 flex-wrap mb-1">
            {project.area && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                style={{ background: `${AREA_COLORS[project.area] || "#64748B"}18`, color: AREA_COLORS[project.area] || "#64748B" }}>
                {AREAS[project.area]?.name}
              </span>
            )}
            {drift && (
              <span className="flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded"
                style={{ background: "#F59E0B18", color: "#F59E0B" }}>
                <AlertTriangle size={9} /> needs a call
              </span>
            )}
          </div>

          <h3 className={`font-semibold ${hero ? "text-base" : "text-sm"} truncate`} style={{ color: "var(--text-primary)" }}>
            {project.title}
          </h3>

          {/* Next action — first-class, not a footnote */}
          {project.nextAction && (
            <p className="text-xs mt-1.5 flex items-start gap-1.5" style={{ color: "var(--text-secondary)" }}>
              <span className="font-mono shrink-0" style={{ color: "var(--accent)" }}>→</span>
              <span className="min-w-0">{project.nextAction}</span>
            </p>
          )}

          {/* Shipping event / drift prompt */}
          {project.shippingEvent ? (
            <p className="text-xs mt-1 flex items-center gap-1.5" style={{ color: "var(--text-tertiary)" }}>
              <Rocket size={11} style={{ color: "var(--accent)", flexShrink: 0 }} />
              <span className="truncate">Ships: {project.shippingEvent}</span>
            </p>
          ) : (project.status === "active" || project.status === "planning") && (
            <p className="text-xs mt-1" style={{ color: "#F59E0B" }}>
              No shipping event — what leaves the machine, and to whom?
            </p>
          )}

          {/* Progress — only when there ARE linked tasks; ROADMAP-driven
              projects don't get a misleading 0% */}
          {totalTasks > 0 && (
            <div className="mt-2.5 max-w-[220px]">
              <div className="flex justify-between mb-1">
                <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
                  {doneTasks}/{totalTasks} tasks
                </span>
                <span className="text-[10px] font-mono" style={{ color: "var(--accent)" }}>{progress}%</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-tertiary)" }}>
                <div className="h-full w-full rounded-full origin-left transition-transform"
                  style={{ transform: `scaleX(${progress / 100})`, background: "var(--accent)", transitionDuration: "var(--dur-slow)", transitionTimingFunction: "var(--ease-out-custom)" }} />
              </div>
            </div>
          )}

          <div className="flex items-center gap-3 mt-2">
            {sinceShip !== null ? (
              <span className="text-[11px]" style={{ color: sinceShip > 14 ? "#F59E0B" : "var(--text-tertiary)" }}>
                Last ship {sinceShip}d ago
              </span>
            ) : project.updatedAt && (
              // No ship yet — fall back to last-touched so the card still shows recency.
              <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                Updated {daysSince(new Date(project.updatedAt))}d ago
              </span>
            )}
            {project.targetDate && (
              <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                Target {new Date(project.targetDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </span>
            )}
          </div>
        </button>

        {/* Right column: status + expand + menu (siblings, not nested in the button) */}
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-[11px] px-2 py-0.5 rounded-full capitalize"
            style={{ background: `${meta?.color || "#64748B"}20`, color: meta?.color || "#64748B" }}>
            {project.status}
          </span>
          <button onClick={() => setExpanded((e) => !e)} aria-label={expanded ? "Collapse" : "Expand"}
            className="p-1 rounded transition-transform duration-150 active:scale-[0.9]" style={{ color: "var(--text-tertiary)" }}>
            {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
          <div className="relative" ref={menuRef}>
            <button onClick={() => setShowMenu((s) => !s)} aria-label="Project actions"
              className="p-1 rounded transition-transform duration-150 active:scale-[0.9]" style={{ color: "var(--text-tertiary)" }}>
              <MoreHorizontal size={15} />
            </button>
            {showMenu && (
              <div className="absolute right-0 top-full mt-1 rounded-lg shadow-lg py-1 z-50 min-w-[150px] pop-in origin-top-right"
                style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-primary)" }}>
                {STATUS_COLUMNS.map((col) => (
                  <button key={col.status}
                    onClick={() => { onUpdate(project.id, { status: col.status }); setShowMenu(false); }}
                    className="w-full text-left text-xs px-3 py-1.5 flex items-center gap-2 hover:bg-[var(--bg-tertiary)] transition-colors"
                    style={{ color: "var(--text-primary)" }}>
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: col.color }} /> {col.label}
                  </button>
                ))}
                <div className="my-1 h-px" style={{ background: "var(--border-primary)" }} />
                <button
                  onClick={() => {
                    setShowMenu(false);
                    // Kills are fine, but they're a decision: in-flight projects
                    // don't get archived without a logged reason.
                    const inFlight = project.status === "active" || project.status === "planning";
                    let killReason: string | undefined;
                    if (inFlight) {
                      const reason = window.prompt("One-line reason for killing this project:");
                      if (reason === null) return;
                      killReason = reason.trim() || undefined;
                    }
                    onUpdate(project.id, { status: "archived" as ProjectStatus, ...(killReason ? { killReason } : {}) });
                  }}
                  className="w-full text-left text-xs px-3 py-1.5 flex items-center gap-2 hover:bg-[var(--bg-tertiary)] transition-colors"
                  style={{ color: "var(--text-secondary)" }}>
                  <Archive size={12} /> Archive
                </button>
                <button
                  onClick={() => { setConfirmDelete(true); setShowMenu(false); }}
                  className="w-full text-left text-xs px-3 py-1.5 hover:bg-[var(--bg-tertiary)] transition-colors"
                  style={{ color: "#EF4444" }}>
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 border-t enter" style={{ borderColor: "var(--border-primary)" }}>
          <div className="flex items-center justify-between mt-3 mb-2">
            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--text-tertiary)" }}>
              Linked tasks ({totalTasks})
            </span>
            <button onClick={() => setShowTaskForm(true)}
              className="text-xs px-2 py-1 rounded bg-sage-400 text-white transition-transform duration-150 active:scale-[0.95]">
              <Plus size={12} className="inline mr-1" />Add
            </button>
          </div>
          {showTaskForm && (
            <div className="mb-2">
              <TaskCreateForm
                onSubmit={(data) => { onTaskCreate({ ...data, projectId: project.id }); setShowTaskForm(false); }}
                onCancel={() => setShowTaskForm(false)}
              />
            </div>
          )}
          <div className="space-y-1">
            {projectTasks.length === 0 && !showTaskForm && (
              <p className="text-xs py-2 text-center" style={{ color: "var(--text-tertiary)" }}>
                No linked tasks — this project may run off its ROADMAP instead.
              </p>
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

  const field = { background: "var(--bg-tertiary)", color: "var(--text-primary)", border: "1px solid var(--border-primary)" } as const;

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
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-sage-400 text-white hover:bg-sage-500 transition-colors font-medium active:scale-[0.97]">
          <Plus size={12} /> Log a ship
        </button>
      </div>

      {shipped30 === 0 && entries.length === 0 && !showForm && (
        <p className="text-xs mb-3" style={{ color: "var(--text-tertiary)" }}>
          Nothing has left the machine yet. Progress here beats progress on the tracker.
        </p>
      )}

      {showForm && (
        <form onSubmit={submit} className="rounded-xl p-4 space-y-3 mb-4 enter"
          style={{ background: "var(--bg-secondary)", border: "1px solid var(--accent)" }}>
          <input type="text" value={what} onChange={(e) => setWhat(e.target.value)} autoFocus
            placeholder="What shipped? (rough is fine — it left the machine)"
            className="w-full text-sm font-medium outline-none rounded-lg px-3 py-2" style={field} />
          <input type="text" value={toWhom} onChange={(e) => setToWhom(e.target.value)}
            placeholder="To whom? (a person, a public post, a deploy someone was told about)"
            className="w-full text-xs outline-none rounded-lg px-3 py-2" style={field} />
          <input type="text" value={predicted} onChange={(e) => setPredicted(e.target.value)}
            placeholder="Predicted reaction — write it down before reality answers"
            className="w-full text-xs outline-none rounded-lg px-3 py-2" style={field} />
          <div className="flex items-center gap-2">
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)}
              className="text-xs rounded-lg px-2 py-1.5 outline-none" style={field}>
              <option value="">No project</option>
              {projects.filter((p) => p.status !== "archived").map((p) => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>
            <div className="flex-1" />
            <button type="button" onClick={() => setShowForm(false)}
              className="text-xs px-3 py-1.5 rounded-lg active:scale-[0.97] transition-transform duration-150" style={{ color: "var(--text-secondary)", background: "var(--bg-tertiary)" }}>Cancel</button>
            <button type="submit"
              className="text-xs px-3 py-1.5 rounded-lg bg-sage-400 text-white hover:bg-sage-500 transition-colors font-medium active:scale-[0.97]">Log it</button>
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
                      <button onClick={() => saveActual(entry.id)} className="flex-shrink-0 active:scale-[0.95] transition-transform duration-150" style={{ color: "#F59E0B" }}>
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

// --- Grouped section header ---

function GroupHeader({ color, label, count }: { color: string; label: string; count: number }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      <h2 className="text-xs font-bold uppercase tracking-widest" style={{ color }}>{label}</h2>
      <span className="text-xs font-mono" style={{ color: "var(--text-tertiary)" }}>{count}</span>
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
  const [showDone, setShowDone] = useState(false);

  const handleProjectUpdate = async (id: string, data: Partial<Project>) => {
    try {
      await updateProject(id, data);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Update failed", "error");
    }
  };

  const handleProjectCreate = async (data: Omit<Project, "id" | "createdAt" | "updatedAt">) => {
    try {
      await createProject(data);
      setShowForm(false);
      toast("Project created");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Create failed", "error");
    }
  };

  // Momentum figures
  const activeCount = projects.filter((p) => p.status === "active").length;
  const shipped30 = shipLog.filter((e) => e.date && daysSince(new Date(e.date)) <= 30).length;
  const lastShip = shipLog
    .map((e) => (e.date ? new Date(e.date) : null))
    .filter((d): d is Date => d !== null)
    .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

  // Last ship per project (per-card momentum)
  const lastShipByProject = new Map<string, Date>();
  for (const e of shipLog) {
    if (!e.projectId || !e.date) continue;
    const d = new Date(e.date);
    const prev = lastShipByProject.get(e.projectId);
    if (!prev || d > prev) lastShipByProject.set(e.projectId, d);
  }

  const byStatus = (s: ProjectStatus) => projects.filter((p) => p.status === s);
  const activeP = byStatus("active");
  const pipelineP = [...byStatus("planning"), ...byStatus("paused")];
  const doneP = byStatus("completed");
  const anyLive = projects.some((p) => p.status !== "archived");

  // Loose ends across in-flight projects (always on, not Sun/Mon-gated)
  const looseEnds = projects
    .map((p) => {
      const reason = looseEnd(p, tasks.filter((t) => t.projectId === p.id));
      return reason ? { project: p, reason } : null;
    })
    .filter((x): x is { project: Project; reason: string } => x !== null);

  const cardProps = (p: Project, hero = false) => ({
    project: p, tasks, lastShip: lastShipByProject.get(p.id) ?? null, hero,
    onUpdate: handleProjectUpdate, onDelete: deleteProject,
    onTaskUpdate: updateTask, onTaskDelete: deleteTask, onTaskCreate: createTask,
  });

  return (
    <div className="space-y-5 max-w-2xl">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap enter">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
            <FolderKanban size={22} style={{ color: "var(--accent)" }} /> Projects
          </h1>
          <p className="text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>
            What&apos;s in flight, and what&apos;s leaving the machine.
          </p>
        </div>
        {!showForm && (
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium bg-sage-400 text-white hover:bg-sage-500 transition-colors active:scale-[0.97]">
            <Plus size={15} /> New project
          </button>
        )}
      </div>

      {/* Momentum */}
      <div className="enter" style={{ ["--enter-delay" as string]: "30ms" }}>
        <MomentumBar activeCount={activeCount} shipped30={shipped30} lastShip={lastShip} />
      </div>

      {/* Loose ends */}
      {looseEnds.length > 0 && (
        <div className="enter" style={{ ["--enter-delay" as string]: "60ms" }}>
          <LooseEnds items={looseEnds} />
        </div>
      )}

      {showForm && (
        <ProjectCreateForm onSubmit={handleProjectCreate} onCancel={() => setShowForm(false)} />
      )}

      {/* Loading skeletons */}
      {loading && projects.length === 0 && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
      )}

      {/* Empty */}
      {!loading && !anyLive && !showForm && (
        <div className="flex flex-col items-center justify-center py-16 rounded-xl text-center enter"
          style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}>
          <FolderKanban size={44} style={{ color: "var(--text-tertiary)" }} className="mb-4" />
          <p className="text-lg font-medium" style={{ color: "var(--text-primary)" }}>No projects yet</p>
          <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
            Create one, name its shipping event, then get it out the door.
          </p>
        </div>
      )}

      {/* Active — the hero set */}
      {activeP.length > 0 && (
        <div className="enter" style={{ ["--enter-delay" as string]: "90ms" }}>
          <GroupHeader color="#7C9E8A" label="Active" count={activeP.length} />
          <div className="space-y-3">
            {activeP.map((p) => <ProjectCard key={p.id} {...cardProps(p, true)} />)}
          </div>
        </div>
      )}

      {/* Pipeline — planning + paused */}
      {pipelineP.length > 0 && (
        <div className="enter" style={{ ["--enter-delay" as string]: "120ms" }}>
          <GroupHeader color="#64748B" label="Pipeline" count={pipelineP.length} />
          <div className="space-y-2">
            {pipelineP.map((p) => <ProjectCard key={p.id} {...cardProps(p)} />)}
          </div>
        </div>
      )}

      {/* Completed — collapsed by default */}
      {doneP.length > 0 && (
        <div>
          <button onClick={() => setShowDone((s) => !s)}
            className="flex items-center gap-2 mb-2 transition-transform duration-150 active:scale-[0.98]">
            <span className="h-2 w-2 rounded-full" style={{ background: "#6366F1" }} />
            <span className="text-xs font-bold uppercase tracking-widest" style={{ color: "#6366F1" }}>Completed</span>
            <span className="text-xs font-mono" style={{ color: "var(--text-tertiary)" }}>{doneP.length}</span>
            {showDone ? <ChevronUp size={14} style={{ color: "var(--text-tertiary)" }} /> : <ChevronDown size={14} style={{ color: "var(--text-tertiary)" }} />}
          </button>
          {showDone && (
            <div className="space-y-2 enter">
              {doneP.map((p) => <ProjectCard key={p.id} {...cardProps(p)} />)}
            </div>
          )}
        </div>
      )}

      <ShipLogSection entries={shipLog} projects={projects} onLog={logShip} onUpdate={updateEntry} />
    </div>
  );
}

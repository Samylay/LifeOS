"use client";

import { useState, useEffect, useRef } from "react";
import {
  FolderKanban, Plus, Archive, MoreHorizontal, Rocket, Flag,
  ChevronDown, ChevronUp, AlertTriangle,
} from "lucide-react";
import { useProjects, WIP_LIMIT } from "@/lib/use-projects";
import { useGoals } from "@/lib/use-goals";
import { useShipLog } from "@/lib/use-ship-log";
import { useTasks } from "@/lib/use-tasks";
import { useToast } from "@/components/toast";
import { Skeleton } from "@/components/skeleton";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { CountUp } from "@/components/count-up";
import { GoalSection, GoalEditor, GOAL_STATE_RANK } from "@/components/goal-section";
import type { Project, ProjectStatus, AreaId, Task, ShipLogEntry, Goal } from "@/lib/types";
import { AREAS, mondayOf, goalPlanState, commitmentsForWeek, localDayOf, withShipActivity, parseTags } from "@/lib/types";
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

// --- Momentum hero ---
// The page's anchor, from the "LifeOS Mobile" design (claude.ai/design,
// 2026-07-14): one dark sage card instead of three tiles — shipped/30d as the
// hero number, days-since-ship with the coaching line, WIP pips. A readout,
// not a control; deliberately the only dark element on the page.

function MomentumHero({
  activeCount, shipped30, lastShip,
}: {
  activeCount: number;
  shipped30: number;
  lastShip: Date | null;
}) {
  const atLimit = activeCount >= WIP_LIMIT;
  const sinceShip = lastShip ? daysSince(lastShip) : null;
  const cold = sinceShip === null || sinceShip > 7;

  const sinceLabel =
    sinceShip === null ? "Nothing shipped yet" :
    sinceShip === 0 ? "Shipped today" :
    `${sinceShip} day${sinceShip === 1 ? "" : "s"} since last ship`;
  const coach =
    sinceShip === 0 ? "That's the job. Again tomorrow." :
    cold ? "Nothing out the door this week — building is not shipping." :
    "Building is not shipping. Keep the streak.";

  return (
    <div
      className="enter hover-lift relative overflow-hidden rounded-2xl p-5"
      style={{ background: "linear-gradient(145deg,#33403C,#212924)", color: "#fff" }}
    >
      <div
        aria-hidden
        className="absolute -top-16 -right-12 h-52 w-52 rounded-full"
        style={{ background: "radial-gradient(circle, rgba(124,158,138,0.4), rgba(124,158,138,0) 70%)" }}
      />
      <div className="relative flex items-center gap-5 flex-wrap">
        <div className="shrink-0">
          <p className="text-4xl font-bold leading-none tabular-nums">
            <CountUp value={shipped30} />
          </p>
          <p className="text-xs mt-1.5" style={{ color: "#9EBAAA" }}>shipped / 30d</p>
        </div>
        <div aria-hidden className="w-px self-stretch" style={{ background: "rgba(255,255,255,0.15)" }} />
        <div className="flex-1 min-w-[180px]">
          <p className="text-sm font-semibold">{sinceLabel}</p>
          <p className="text-xs mt-0.5" style={{ color: cold ? "#F2B8AC" : "rgba(255,255,255,0.65)" }}>
            {coach}
          </p>
          <div className="flex items-center gap-1.5 mt-3">
            {Array.from({ length: WIP_LIMIT }).map((_, i) => (
              <span
                key={i}
                aria-hidden
                className="h-1.5 w-6 rounded-full"
                style={{
                  background: i < activeCount ? (atLimit ? "#F5C87B" : "#7C9E8A") : "rgba(255,255,255,0.14)",
                  transition: "background-color var(--dur-base) var(--ease-out-custom)",
                }}
              />
            ))}
            <span className="text-[11px] ml-1 font-mono" style={{ color: atLimit ? "#F5C87B" : "rgba(255,255,255,0.55)" }}>
              {activeCount}/{WIP_LIMIT} active{atLimit ? " · at limit" : ""}
            </span>
          </div>
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

function ProjectCreateForm({ goals, defaultGoalId, onSubmit, onCancel }: {
  goals: Goal[];
  defaultGoalId?: string;
  onSubmit: (data: Omit<Project, "id" | "createdAt" | "updatedAt">) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [area, setArea] = useState<AreaId | "">("");
  const [status, setStatus] = useState<ProjectStatus>("planning");
  const [nextAction, setNextAction] = useState("");
  const [shippingEvent, setShippingEvent] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [goalId, setGoalId] = useState(defaultGoalId ?? "");

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
      goalId: goalId || undefined,
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
        <select value={goalId} onChange={(e) => setGoalId(e.target.value)}
          className="text-xs rounded-lg px-2 py-1.5 outline-none max-w-[180px]" style={field}>
          <option value="">No goal</option>
          {goals.map((g) => (<option key={g.id} value={g.id}>{g.title}</option>))}
        </select>
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

// Kill-reason capture for in-flight projects — a real dialog (not window.prompt).
// The reason is optional but nudged: a kill is a logged decision, not silent drift.
function ArchiveDialog({
  open, title, onConfirm, onCancel,
}: {
  open: boolean;
  title: string;
  onConfirm: (reason: string | undefined) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    document.addEventListener("keydown", onEsc);
    return () => { clearTimeout(t); document.removeEventListener("keydown", onEsc); };
  }, [open, onCancel]);

  if (!open) return null;
  const submit = () => { onConfirm(reason.trim() || undefined); setReason(""); };
  const cancel = () => { setReason(""); onCancel(); };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.5)" }} onClick={cancel}>
      <div className="rounded-xl p-6 max-w-sm w-full mx-4 pop-in origin-center"
        style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)", boxShadow: "var(--shadow-lg)" }}
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ background: "#F59E0B15" }}>
            <Archive size={18} style={{ color: "#F59E0B" }} />
          </div>
          <h3 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>Archive project</h3>
        </div>
        <p className="text-sm mb-3" style={{ color: "var(--text-secondary)" }}>
          Killing <span className="font-medium" style={{ color: "var(--text-primary)" }}>&ldquo;{title}&rdquo;</span> is fine — but log why, so it&rsquo;s a decision, not drift.
        </p>
        <textarea
          ref={inputRef}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(); }}
          rows={2}
          placeholder="One-line reason (optional)"
          className="w-full rounded-lg px-3 py-2 text-sm resize-none mb-5 outline-none focus:ring-1"
          style={{ background: "var(--bg-tertiary)", color: "var(--text-primary)", border: "1px solid var(--border-primary)" }}
        />
        <div className="flex justify-end gap-2">
          <button onClick={cancel}
            className="rounded-lg px-4 py-2 text-sm font-medium transition-transform duration-150 active:scale-[0.97]"
            style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}>
            Cancel
          </button>
          <button onClick={submit}
            className="rounded-lg px-4 py-2 text-sm font-medium text-white transition-transform duration-150 active:scale-[0.97]"
            style={{ background: "#F59E0B" }}>
            Archive
          </button>
        </div>
      </div>
    </div>
  );
}

function ProjectCard({
  project, tasks, goals, lastShip, hero, onUpdate, onDelete, onTaskUpdate, onTaskDelete, onTaskCreate,
}: {
  project: Project;
  tasks: Task[];
  goals: Goal[];
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
  const [showArchive, setShowArchive] = useState(false);
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
              // Staleness thresholds from the mobile design: amber past a week,
              // red past two — the card itself says when a project has gone cold.
              <span className="text-[11px] font-mono" style={{ color: sinceShip > 14 ? "#EF4444" : sinceShip > 7 ? "#F59E0B" : "var(--text-tertiary)" }}>
                {sinceShip === 0 ? "shipped today" : `${sinceShip}d since ship`}
              </span>
            ) : project.updatedAt && (
              // No ship yet — fall back to last-touched so the card still shows recency.
              <span className="text-[11px] font-mono" style={{ color: "var(--text-tertiary)" }}>
                updated {daysSince(new Date(project.updatedAt))}d ago
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
                    // don't get archived without a logged reason (captured in a
                    // real dialog); anything else archives straight away.
                    const inFlight = project.status === "active" || project.status === "planning";
                    if (inFlight) setShowArchive(true);
                    else onUpdate(project.id, { status: "archived" as ProjectStatus });
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
          {/* Goal link — which direction this project serves; ships roll up there */}
          <div className="flex items-center gap-2 mt-3">
            <Flag size={12} style={{ color: "var(--text-tertiary)" }} />
            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--text-tertiary)" }}>Goal</span>
            <select
              value={project.goalId ?? ""}
              onChange={(e) => onUpdate(project.id, { goalId: e.target.value } as Partial<Project>)}
              className="text-xs rounded-lg px-2 py-1 outline-none max-w-[220px]"
              style={{ background: "var(--bg-tertiary)", color: "var(--text-primary)", border: "1px solid var(--border-primary)" }}
            >
              <option value="">No goal</option>
              {goals.map((g) => (<option key={g.id} value={g.id}>{g.title}</option>))}
            </select>
          </div>
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
      <ArchiveDialog
        open={showArchive}
        title={project.title}
        onConfirm={(reason) => {
          onUpdate(project.id, { status: "archived" as ProjectStatus, ...(reason ? { killReason: reason } : {}) });
          setShowArchive(false);
        }}
        onCancel={() => setShowArchive(false)}
      />
    </div>
  );
}

// --- Ship Log ---
// One row per thing that left the machine.

function ShipLogSection({ entries, projects, onLog }: {
  entries: ShipLogEntry[];
  projects: Project[];
  onLog: (data: Omit<ShipLogEntry, "id" | "createdAt">) => Promise<unknown>;
}) {
  const [showForm, setShowForm] = useState(false);
  const [what, setWhat] = useState("");
  const [toWhom, setToWhom] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [projectId, setProjectId] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  const shipped30 = entries.filter((e) => now - new Date(e.date).getTime() <= 30 * DAY_MS).length;
  const projectTitle = (id?: string) => projects.find((p) => p.id === id)?.title;

  // Tag universe across all entries, most-used first — the filter row.
  const tagCounts = new Map<string, number>();
  for (const e of entries) for (const t of e.tags ?? []) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
  const allTags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
  const visible = tagFilter ? entries.filter((e) => e.tags?.includes(tagFilter)) : entries;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!what.trim() || !toWhom.trim()) return;
    const tags = parseTags(tagsInput);
    await onLog({
      date: new Date(),
      what: what.trim(),
      toWhom: toWhom.trim(),
      tags: tags.length > 0 ? tags : undefined,
      projectId: projectId || undefined,
    });
    setWhat(""); setToWhom(""); setTagsInput("");
    setProjectId("");
    setShowForm(false);
  };

  const field = { background: "var(--bg-tertiary)", color: "var(--text-primary)", border: "1px solid var(--border-primary)" } as const;

  return (
    <div className="mt-10 lg:mt-0">
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
          <input type="text" value={tagsInput} onChange={(e) => setTagsInput(e.target.value)}
            placeholder="Tags, comma-separated (lifeos, content, infra…)"
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

      {/* Tag filter — only appears once entries carry tags */}
      {allTags.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap mb-3">
          <button onClick={() => setTagFilter(null)}
            className="text-[11px] font-medium rounded-full px-2.5 py-1 transition-[background,color,transform] duration-150 active:scale-[0.95]"
            style={{
              background: tagFilter === null ? "var(--accent)" : "var(--bg-tertiary)",
              color: tagFilter === null ? "#fff" : "var(--text-secondary)",
            }}>
            All
          </button>
          {allTags.map((t) => (
            <button key={t} onClick={() => setTagFilter(tagFilter === t ? null : t)}
              className="text-[11px] font-medium rounded-full px-2.5 py-1 transition-[background,color,transform] duration-150 active:scale-[0.95]"
              style={{
                background: tagFilter === t ? "var(--accent)" : "var(--bg-tertiary)",
                color: tagFilter === t ? "#fff" : "var(--text-secondary)",
              }}>
              {t} <span className="font-mono opacity-70">{tagCounts.get(t)}</span>
            </button>
          ))}
        </div>
      )}

      {/* Compact rows: dot + what + relative time; expand for the audience,
          tags, and project. */}
      <div className="rounded-xl overflow-hidden" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}>
        {visible.map((entry, i) => {
          const open = openId === entry.id;
          const days = daysSince(new Date(entry.date));
          return (
            <div key={entry.id} style={i > 0 ? { borderTop: "1px solid var(--border-primary)" } : undefined}>
              <button
                onClick={() => setOpenId(open ? null : entry.id)}
                aria-expanded={open}
                className="w-full flex items-center gap-3 px-4 py-3 text-left transition-transform duration-150 active:scale-[0.99]"
              >
                <span className="h-2 w-2 rounded-full shrink-0" style={{ background: "var(--accent)" }} />
                <span className="flex-1 min-w-0 text-sm truncate" style={{ color: "var(--text-primary)" }}>{entry.what}</span>
                <span className="text-xs font-mono shrink-0" style={{ color: "var(--text-tertiary)" }}>
                  {days === 0 ? "today" : `${days}d`}
                </span>
                <ChevronDown
                  size={13}
                  className="shrink-0 transition-transform duration-200"
                  style={{ color: "var(--text-tertiary)", transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
                />
              </button>
              {open && (
                <div className="px-4 pb-3 enter">
                  <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                    → {entry.toWhom}
                    {projectTitle(entry.projectId) && (
                      <span className="ml-2 px-1.5 py-0.5 rounded" style={{ background: "var(--bg-tertiary)", color: "var(--text-tertiary)" }}>
                        {projectTitle(entry.projectId)}
                      </span>
                    )}
                  </p>
                  {(entry.tags?.length ?? 0) > 0 && (
                    <div className="flex items-center gap-1 flex-wrap mt-1.5">
                      {entry.tags!.map((t) => (
                        <button key={t} onClick={() => setTagFilter(t)}
                          className="text-[10px] font-medium rounded-full px-2 py-0.5 transition-transform duration-150 active:scale-[0.95]"
                          style={{ background: "var(--accent-bg)", color: "var(--accent)" }}>
                          {t}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
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
  const { goals, createGoal } = useGoals();
  const { entries: shipLog, logShip } = useShipLog();
  const { tasks, updateTask, deleteTask, createTask } = useTasks();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [showDoneGoals, setShowDoneGoals] = useState(false);

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

  // --- Goal ⇄ project integration --------------------------------------
  // Goals set the quarter's direction; projects are the vehicles that ship
  // it. The page groups live projects under the goal they serve, and ships
  // logged against those projects count as activity on the goal.

  const projectById = new Map(projects.map((p) => [p.id, p]));
  const shipDatesByGoal = new Map<string, string[]>();
  for (const e of shipLog) {
    if (!e.projectId || !e.date) continue;
    const gid = projectById.get(e.projectId)?.goalId;
    if (!gid) continue;
    if (!shipDatesByGoal.has(gid)) shipDatesByGoal.set(gid, []);
    shipDatesByGoal.get(gid)!.push(localDayOf(new Date(e.date)));
  }

  const week = mondayOf();
  const activeGoals = goals.filter((g) => g.status === "active");
  const doneGoals = goals.filter((g) => g.status !== "active");
  // Goals that need a decision surface first (ships included in the readout).
  const rankGoal = (g: Goal) =>
    GOAL_STATE_RANK[goalPlanState(withShipActivity(g, shipDatesByGoal.get(g.id) ?? []), week)];
  const goalsSorted = [...activeGoals].sort((a, b) => rankGoal(a) - rankGoal(b));

  const goalIds = new Set(activeGoals.map((g) => g.id));
  const statusOrder: Record<ProjectStatus, number> = { active: 0, planning: 1, paused: 2, completed: 3, archived: 4 };
  const live = projects
    .filter((p) => p.status === "active" || p.status === "planning" || p.status === "paused")
    .sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);
  const projectsForGoal = (gid: string) => live.filter((p) => p.goalId === gid);
  const unaligned = live.filter((p) => !p.goalId || !goalIds.has(p.goalId));
  const doneP = projects.filter((p) => p.status === "completed");
  const anyLive = live.length > 0 || activeGoals.length > 0;

  // Week-at-a-glance across active goals (header readout).
  const weekCommits = activeGoals.flatMap((g) => commitmentsForWeek(g, week));
  const weekDone = weekCommits.filter((c) => c.done).length;

  // Loose ends across in-flight projects (always on, not Sun/Mon-gated)
  const looseEnds = projects
    .map((p) => {
      const reason = looseEnd(p, tasks.filter((t) => t.projectId === p.id));
      return reason ? { project: p, reason } : null;
    })
    .filter((x): x is { project: Project; reason: string } => x !== null);

  const cardProps = (p: Project, hero = false) => ({
    project: p, tasks, goals: activeGoals, lastShip: lastShipByProject.get(p.id) ?? null, hero,
    onUpdate: handleProjectUpdate, onDelete: deleteProject,
    onTaskUpdate: updateTask, onTaskDelete: deleteTask, onTaskCreate: createTask,
  });

  return (
    // Mobile is one scrolling feed; at lg the goal/project flow keeps the
    // main column and the ship log becomes a sticky scorekeeping rail with
    // its own scroll, so work and evidence are visible side by side.
    <div className="space-y-5 max-w-2xl lg:max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap enter">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
            <FolderKanban size={22} style={{ color: "var(--accent)" }} /> Projects
          </h1>
          <p className="text-xs mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5" style={{ color: "var(--text-tertiary)" }}>
            <span>Goals set the direction · projects ship it · the ship log keeps score.</span>
            {weekCommits.length > 0 && (
              <span className="font-mono" style={{ color: "var(--text-secondary)" }}>
                {weekDone}/{weekCommits.length} committed this week
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!showGoalForm && (
            <button onClick={() => setShowGoalForm(true)}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-[background,transform] duration-150 active:scale-[0.97]"
              style={{ color: "var(--accent)", background: "var(--accent-bg)" }}>
              <Flag size={15} /> New goal
            </button>
          )}
          {!showForm && (
            <button onClick={() => setShowForm(true)}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium bg-sage-400 text-white hover:bg-sage-500 transition-colors active:scale-[0.97]">
              <Plus size={15} /> New project
            </button>
          )}
        </div>
      </div>

      {/* Momentum */}
      <div className="enter" style={{ ["--enter-delay" as string]: "30ms" }}>
        <MomentumHero activeCount={activeCount} shipped30={shipped30} lastShip={lastShip} />
      </div>

      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-6 lg:items-start">
      <div className="space-y-5 min-w-0">

      {/* Loose ends */}
      {looseEnds.length > 0 && (
        <div className="enter" style={{ ["--enter-delay" as string]: "60ms" }}>
          <LooseEnds items={looseEnds} />
        </div>
      )}

      {showGoalForm && (
        <GoalEditor onCancel={() => setShowGoalForm(false)}
          onSave={(data) => { createGoal(data); setShowGoalForm(false); toast("Goal created"); }} />
      )}
      {showForm && (
        <ProjectCreateForm goals={activeGoals} onSubmit={handleProjectCreate} onCancel={() => setShowForm(false)} />
      )}

      {/* Loading skeletons */}
      {loading && projects.length === 0 && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
      )}

      {/* Empty */}
      {!loading && !anyLive && !showForm && !showGoalForm && (
        <div className="flex flex-col items-center justify-center py-16 rounded-xl text-center enter"
          style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}>
          <FolderKanban size={44} style={{ color: "var(--text-tertiary)" }} className="mb-4" />
          <p className="text-lg font-medium" style={{ color: "var(--text-primary)" }}>Nothing in flight</p>
          <p className="text-sm mt-1 max-w-sm" style={{ color: "var(--text-secondary)" }}>
            Set a goal for the quarter, hang a project on it, name the shipping event, then get it out the door.
          </p>
        </div>
      )}

      {/* Goals — each with the projects that serve it nested beneath */}
      {goalsSorted.map((g, i) => {
        const gp = projectsForGoal(g.id);
        return (
          <GoalSection
            key={g.id}
            goal={g}
            shipDates={shipDatesByGoal.get(g.id) ?? []}
            delay={90 + Math.min(i * 40, 200)}
            projectCount={gp.length}
          >
            {gp.map((p) => <ProjectCard key={p.id} {...cardProps(p, p.status === "active")} />)}
          </GoalSection>
        );
      })}

      {/* Unaligned — live projects serving no goal. Not a crime, but a question. */}
      {unaligned.length > 0 && (
        <div className="enter" style={{ ["--enter-delay" as string]: "120ms" }}>
          <GroupHeader color="#64748B" label={activeGoals.length > 0 ? "No goal" : "Projects"} count={unaligned.length} />
          {activeGoals.length > 0 && (
            <p className="text-[11px] mb-2 -mt-1" style={{ color: "var(--text-tertiary)" }}>
              These serve no goal — link them (expand a card) or ask why they&apos;re in flight.
            </p>
          )}
          <div className="space-y-2">
            {unaligned.map((p) => <ProjectCard key={p.id} {...cardProps(p, p.status === "active")} />)}
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

      {/* Done/dropped goals — collapsed archive with reactivate inside */}
      {doneGoals.length > 0 && (
        <div>
          <button onClick={() => setShowDoneGoals((s) => !s)}
            className="flex items-center gap-2 mb-2 transition-transform duration-150 active:scale-[0.98]">
            <span className="h-2 w-2 rounded-full" style={{ background: "var(--text-tertiary)" }} />
            <span className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--text-secondary)" }}>Past goals</span>
            <span className="text-xs font-mono" style={{ color: "var(--text-tertiary)" }}>{doneGoals.length}</span>
            {showDoneGoals ? <ChevronUp size={14} style={{ color: "var(--text-tertiary)" }} /> : <ChevronDown size={14} style={{ color: "var(--text-tertiary)" }} />}
          </button>
          {showDoneGoals && (
            <div className="space-y-2 enter">
              {doneGoals.map((g) => (
                <GoalSection key={g.id} goal={g} shipDates={shipDatesByGoal.get(g.id) ?? []} delay={0} projectCount={0} nest={false} />
              ))}
            </div>
          )}
        </div>
      )}

      </div>

      {/* Scorekeeping rail on desktop; below the flow on mobile */}
      <aside className="min-w-0 lg:sticky lg:top-6 lg:max-h-[calc(100vh-4.5rem)] lg:overflow-y-auto lg:pr-1">
        <ShipLogSection entries={shipLog} projects={projects} onLog={logShip} />
      </aside>
      </div>
    </div>
  );
}

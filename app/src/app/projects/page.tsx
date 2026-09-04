"use client";

// /projects — derived state, not maintained state (T-projects-rework-03).
//
// The old surface was 1,161 lines tracking work that was finished: 10
// projects, 7 completed, 1 active and six weeks stale, 10 tasks of which
// none was ever done. Every fact on it was a fact Samy had to update, so it
// stopped being true the moment he stopped maintaining it.
//
// This one answers two questions and nothing else:
//   1. What has stalled and shouldn't have — the thing a list of repos will
//      not tell you, so it leads.
//   2. What to work on next.
//
// Nothing here is typed in. Status, last activity and next task all come from
// the repo, so there is no field that needs an update to stay accurate. The
// only stored state is the archive flag, because archiving is a decision
// rather than a fact.
//
// Tasks are gone. Todoist owns tasks — a second inbox is why none of those
// ten was ever completed.
import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle, Archive, ArchiveRestore, CircleCheck, CircleDot,
  FolderKanban, RefreshCw, UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { Page, PageHeader } from "@/components/ui/page";
import { post } from "@/lib/decide/post";
import type { ProjectStatus } from "@/lib/projects/state";

interface ProjectEntry {
  name: string;
  dir: string;
  state: {
    status: ProjectStatus;
    stallReason: string | null;
    nextAction: { title: string; needsUser: boolean } | null;
  } | null;
  lastCommitAt: string | null;
  lastCommitSubject: string | null;
  autoloopTouchedAt: string | null;
  openTaskCount: number;
  error: string | null;
}

interface Snapshot {
  computedAt: string | null;
  projects: ProjectEntry[];
  computing: boolean;
  stale: boolean;
}

const STATUS_META: Record<ProjectStatus, { label: string; color: string }> = {
  stalled: { label: "stalled", color: "var(--warning)" },
  blocked: { label: "waiting on you", color: "var(--destructive)" },
  moving: { label: "moving", color: "var(--success)" },
  done: { label: "done", color: "var(--muted-foreground)" },
  archived: { label: "archived", color: "var(--muted-foreground)" },
};

// Stalled first, then what is waiting on Samy, then live work. Done and
// archived are not in the active view at all.
const ACTIVE_ORDER: ProjectStatus[] = ["stalled", "blocked", "moving"];

function ago(iso: string | null): string {
  if (!iso) return "never";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (Number.isNaN(days)) return "unknown";
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function computedLabel(snap: Snapshot): string {
  if (snap.computing) return "scanning repos…";
  if (!snap.computedAt) return "not computed yet";
  const mins = Math.floor((Date.now() - new Date(snap.computedAt).getTime()) / 60_000);
  const when = mins < 1 ? "just now" : mins === 1 ? "1 min ago" : `${mins} min ago`;
  // Say when, always. A number pretending to be live is the failure this
  // surface exists to fix.
  return snap.stale ? `computed ${when} · refreshing` : `computed ${when}`;
}

function ProjectRow({
  project,
  onArchive,
}: {
  project: ProjectEntry;
  onArchive: (name: string, archived: boolean) => void;
}) {
  const status = project.state?.status;
  const meta = status ? STATUS_META[status] : null;
  const isArchived = status === "archived";

  return (
    <li className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-foreground">{project.name}</h3>
            {meta && (
              <span
                className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                style={{ color: meta.color, background: `color-mix(in srgb, ${meta.color} 12%, transparent)` }}
              >
                {meta.label}
              </span>
            )}
          </div>

          {project.error ? (
            <p className="flex items-start gap-1.5 text-xs text-destructive">
              <AlertTriangle size={12} className="mt-0.5 shrink-0" aria-hidden />
              {project.error}
            </p>
          ) : (
            <>
              {/* The rule behind a stall verdict, in words — a judgement you
                  cannot see the reasoning for is one you cannot trust. */}
              {project.state?.stallReason && (
                <p className="text-xs text-muted-foreground">{project.state.stallReason}</p>
              )}
              <p className="text-xs text-muted-foreground">
                last commit {ago(project.lastCommitAt)}
                {project.openTaskCount > 0 && ` · ${project.openTaskCount} open`}
                {project.autoloopTouchedAt && " · autoloop"}
              </p>
              {project.state?.nextAction && (
                <p className="flex items-start gap-1.5 pt-0.5 text-sm leading-snug text-foreground">
                  {project.state.nextAction.needsUser ? (
                    <UserRound size={13} className="mt-0.5 shrink-0 text-destructive" aria-hidden />
                  ) : (
                    <CircleDot size={13} className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden />
                  )}
                  <span>{project.state.nextAction.title}</span>
                </p>
              )}
            </>
          )}
        </div>

        <button
          onClick={() => onArchive(project.name, !isArchived)}
          aria-label={isArchived ? `Restore ${project.name}` : `Archive ${project.name}`}
          title={isArchived ? "Restore" : "Archive"}
          className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-transform duration-[var(--dur-fast)] ease-[var(--ease-out-custom)] hover:text-foreground active:scale-[0.97] max-lg:[min-height:36px]"
        >
          {isArchived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
        </button>
      </div>
    </li>
  );
}

export default function ProjectsPage() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [failed, setFailed] = useState(false);
  const [showDone, setShowDone] = useState(false);

  const refresh = useCallback(async () => {
    const d = await fetch("/api/projects/state")
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    setFailed(d === null);
    if (d) setSnap(d as Snapshot);
  }, []);

  useEffect(() => { queueMicrotask(() => void refresh()); }, [refresh]);

  // The first load lands before the background scan finishes, so poll while
  // it is still computing rather than showing an empty surface forever.
  useEffect(() => {
    if (!snap?.computing) return;
    const t = setTimeout(() => void refresh(), 1500);
    return () => clearTimeout(t);
  }, [snap, refresh]);

  const archive = async (name: string, archived: boolean) => {
    try {
      const d = await post("/api/projects/archive", { name, archived });
      toast.success(`${name} ${d.result}`, {
        // Recoverable in one gesture: archiving resolves a stall, it does not
        // destroy anything.
        action: { label: "Undo", onClick: () => void archive(name, !archived) },
      });
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "could not archive");
    }
  };

  const projects = snap?.projects ?? [];
  const active = ACTIVE_ORDER.flatMap((status) =>
    projects.filter((p) => p.state?.status === status),
  );
  const broken = projects.filter((p) => p.error);
  const done = projects.filter((p) => p.state?.status === "done" || p.state?.status === "archived");

  return (
    <Page narrow className="max-w-lg">
      <PageHeader
        kicker="Derived from your repos"
        title="Projects"
        description="What stalled, and what to pick up. Nothing here is typed in."
        icon={FolderKanban}
      />

      {failed ? (
        <div className="space-y-3 rounded-xl border border-border bg-card p-10 text-center">
          <p className="text-sm text-muted-foreground">Couldn&apos;t load project state.</p>
          <button onClick={() => refresh()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-foreground transition-transform duration-[var(--dur-fast)] ease-[var(--ease-out-custom)] active:scale-[0.97] max-lg:[min-height:44px]">
            <RefreshCw size={14} /> Retry
          </button>
        </div>
      ) : !snap ? (
        <div className="shimmer rounded-xl bg-card p-10 text-center text-sm text-muted-foreground">
          loading…
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">{computedLabel(snap)}</p>

          {active.length === 0 && broken.length === 0 ? (
            <p className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
              {snap.computing
                ? "Reading your repos…"
                : "Nothing active. Every project is done or archived."}
            </p>
          ) : (
            <ul className="space-y-2">
              {active.map((p) => <ProjectRow key={p.name} project={p} onArchive={archive} />)}
              {/* A repo that cannot be read stays in the list with its
                  error — silently dropping it is how a surface starts lying. */}
              {broken.map((p) => <ProjectRow key={p.name} project={p} onArchive={archive} />)}
            </ul>
          )}

          {done.length > 0 && (
            <div className="space-y-2">
              <button
                onClick={() => setShowDone((v) => !v)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-transform duration-[var(--dur-fast)] ease-[var(--ease-out-custom)] hover:text-foreground active:scale-[0.97]"
              >
                <CircleCheck size={13} aria-hidden />
                {showDone ? "Hide" : "Show"} done and archived ({done.length})
              </button>
              {showDone && (
                <ul className="space-y-2">
                  {done.map((p) => <ProjectRow key={p.name} project={p} onArchive={archive} />)}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </Page>
  );
}

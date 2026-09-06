"use client";

// T-status-rework-03 — the alert inbox, on the operational surface.
//
// Alerts and health were two routes, so neither answered "is anything wrong"
// on its own. This is the /pager inbox living where health lives: grouped by
// stream so a nightly summary and a real alert are distinguishable, with the
// unread count doing the work the old separate route used to.
//
// An empty body renders as visibly broken rather than as a blank row. That is
// a real defect observed on several `alerts`-stream notifications (2026-09-01
// 05:37 and 05:27, 2026-08-31 23:03) — a blank row reads as "nothing to see"
// when it actually means the alert lost its message.
import { useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowUpRight, CheckCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { PAGER_STREAMS, useNotifications, type PagerMessage, type PagerStream } from "@/lib/use-notifications";

function timeAgo(d: Date): string {
  const mins = Math.floor((Date.now() - d.getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function Row({ m, onRead }: { m: PagerMessage; onRead: () => void }) {
  const broken = !(m.body ?? "").trim();
  const inner = (
    <div className="flex items-start gap-2">
      <span
        className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", m.readAt ? "bg-transparent" : "bg-primary")}
        aria-label={m.readAt ? undefined : "unread"}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{m.title}</p>
        {broken ? (
          // Not blank — blank looks like nothing happened.
          <p className="flex items-center gap-1 text-xs text-destructive">
            <AlertCircle size={11} aria-hidden /> alert arrived with an empty body
          </p>
        ) : (
          <p className="line-clamp-2 text-xs text-muted-foreground">{m.body}</p>
        )}
      </div>
      <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(m.createdAt)}</span>
      {m.path && <ArrowUpRight size={12} className="mt-1 shrink-0 text-muted-foreground" aria-hidden />}
    </div>
  );

  const className = cn(
    "block rounded-lg border border-border px-3 py-2 transition-transform duration-[var(--dur-fast)] ease-[var(--ease-out-custom)] active:scale-[0.99]",
    !m.readAt && "bg-card",
  );

  // A deep link opens the surface the alert is about, in one tap.
  return m.path ? (
    <Link href={m.path} onClick={onRead} className={className}>{inner}</Link>
  ) : (
    <button onClick={onRead} className={cn(className, "w-full text-left")}>{inner}</button>
  );
}

export function AlertInbox() {
  const { messages, loading, markRead, markAllRead } = useNotifications();
  const [stream, setStream] = useState<PagerStream | "all">("all");
  const [expanded, setExpanded] = useState(false);

  const visible = messages.filter((m) => stream === "all" || m.stream === stream);
  const unread = messages.filter((m) => !m.readAt).length;
  const shown = expanded ? visible.slice(0, 100) : visible.slice(0, 8);

  if (loading) return null;

  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-foreground">
          Alerts{unread > 0 && <span className="ml-1.5 text-xs text-primary">{unread} unread</span>}
        </h2>
        {unread > 0 && (
          <button
            onClick={() => markAllRead(visible)}
            className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-transform duration-[var(--dur-fast)] ease-[var(--ease-out-custom)] hover:text-foreground active:scale-[0.97]"
          >
            <CheckCheck size={12} /> Mark all read
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {(["all", ...PAGER_STREAMS] as const).map((s) => {
          const n = s === "all" ? messages.length : messages.filter((m) => m.stream === s).length;
          if (n === 0 && s !== "all") return null;
          return (
            <button
              key={s}
              onClick={() => setStream(s)}
              className={cn(
                "rounded-full px-2.5 py-1 text-xs font-medium transition-colors duration-[var(--dur-fast)]",
                stream === s ? "bg-surface-3 text-foreground" : "bg-muted text-muted-foreground",
              )}
            >
              {s} ({n})
            </button>
          );
        })}
      </div>

      {visible.length === 0 ? (
        <p className="rounded-lg border border-border px-3 py-4 text-center text-sm text-muted-foreground">
          Nothing here.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {shown.map((m) => (
            <li key={m.id}>
              <Row m={m} onRead={() => { if (!m.readAt) markRead(m.id); }} />
            </li>
          ))}
        </ul>
      )}

      {!expanded && visible.length > shown.length && (
        <button
          onClick={() => setExpanded(true)}
          className="text-xs font-medium text-primary transition-transform duration-[var(--dur-fast)] ease-[var(--ease-out-custom)] active:scale-[0.97]"
        >
          Show {visible.length - shown.length} more
        </button>
      )}
    </section>
  );
}

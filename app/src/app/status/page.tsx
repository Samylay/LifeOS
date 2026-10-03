"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Boxes,
  Cpu,
  ExternalLink,
  Check,
  HardDrive,
  MemoryStick,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";

import { ProgressRing } from "@/components/charts";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Page, PageHeader } from "@/components/ui/page";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertInbox } from "@/components/status/alert-inbox";
import { createRequestGate } from "@/lib/knowledge-request";

const GRAFANA_BASE = process.env.NEXT_PUBLIC_GRAFANA_URL?.replace(/\/$/, "");
const GRAFANA_URL = GRAFANA_BASE ? `${GRAFANA_BASE}/d/homelab/homelab` : null;

const POLL_FAST_MS = 8_000;
const POLL_SLOW_MS = 30_000;
const POLL_FAST_WINDOW_MS = 60_000;
const STALE_AFTER_MS = 30_000;

interface HostMetrics {
  enabled: boolean;
  cpuPct: number | null;
  memPct: number | null;
  memUsedBytes: number | null;
  memTotalBytes: number | null;
  diskPct: number | null;
  diskUsedBytes: number | null;
  diskTotalBytes: number | null;
  load1: number | null;
  uptimeSeconds: number | null;
}

interface Container {
  name: string;
  label?: string;
  up: boolean;
  state: string;
  status: string;
}

interface StandingGoals {
  enabled: boolean;
  total: number;
  ok: number;
  violated: string[];
  flapped24h: string[];
  lastRunAgeSeconds: number | null;
}

interface Problem {
  kind: "goal" | "goal-unknown" | "container" | "host" | "delivery";
  severity: "down" | "warn";
  title: string;
  detail: string;
}

interface StatusData {
  containers: { ok: boolean; containers: Container[]; reason?: string };
  host: HostMetrics;
  goals?: StandingGoals;
  delivery?: { subscriptions: number; lastDeliveredAt: string | null };
  problems?: Problem[];
  verdict?: "clear" | "problems" | "unknown";
}

function gb(bytes: number | null): string {
  if (bytes === null) return "–";
  return `${(bytes / 1e9).toFixed(1)} GB`;
}

function uptime(seconds: number | null): string {
  if (seconds === null) return "–";
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  return days > 0 ? `${days}d ${hours}h` : `${hours}h`;
}

function barColor(percent: number | null): string {
  if (percent === null) return "var(--muted-foreground)";
  if (percent >= 90) return "var(--destructive)";
  if (percent >= 75) return "var(--warning)";
  return "var(--primary)";
}

function useStatus() {
  const [data, setData] = useState<StatusData | null>(null);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const requestGate = useRef(createRequestGate());

  const load = useCallback(async () => {
    const request = requestGate.current.start();
    setRefreshing(true);
    try {
      const response = await fetch("/api/status");
      if (!response.ok) throw new Error();
      const next = await response.json();
      if (!requestGate.current.isCurrent(request)) return;
      setData(next);
      setUpdatedAt(Date.now());
      setError(false);
    } catch {
      if (!requestGate.current.isCurrent(request)) return;
      setError(true);
    } finally {
      if (requestGate.current.isCurrent(request)) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const started = Date.now();
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const delay = Date.now() - started < POLL_FAST_WINDOW_MS ? POLL_FAST_MS : POLL_SLOW_MS;
      timer = setTimeout(async () => {
        if (document.visibilityState !== "hidden") await load();
        schedule();
      }, delay);
    };

    void load();
    schedule();
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);

  return { data, error, refreshing, updatedAt, now, load };
}

function MetricCard({
  icon,
  label,
  percent,
  detail,
}: {
  icon: React.ReactNode;
  label: string;
  percent: number | null;
  detail: string;
}) {
  return (
    <Card className="enter flex items-center gap-4 p-4">
      <ProgressRing
        value={percent === null ? 0 : Math.round(percent)}
        goal={100}
        size={88}
        strokeWidth={7}
        label={label}
        color={barColor(percent)}
        className="[&>span>span:first-child]:text-base [&>span>span:first-child>span]:hidden"
      />
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
          <span className="section-label">{label}</span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      </div>
    </Card>
  );
}

export default function StatusPage() {
  const { data, error, refreshing, updatedAt, now, load } = useStatus();
  const host = data?.host;
  const containers = data?.containers.containers ?? [];
  const sorted = [...containers].sort((a, b) => Number(a.up) - Number(b.up));
  const running = containers.filter((container) => container.up).length;
  const goals = data?.goals;
  const ageSeconds = updatedAt === null ? null : Math.max(0, Math.round((now - updatedAt) / 1_000));
  const stale = updatedAt !== null && now - updatedAt > STALE_AFTER_MS;

  return (
    <Page className="max-w-5xl">
      <PageHeader
        title="System"
        icon={Activity}
        actions={
          <>
            <Button
              onClick={() => void load()}
              disabled={refreshing}
              variant="outline"
              size="sm"
              aria-label="Refresh status"
            >
              <RefreshCw size={15} className={refreshing ? "animate-spin" : undefined} />
              Refresh
            </Button>
            {GRAFANA_URL && (
              <Button asChild variant="ghost" size="sm">
                <a href={GRAFANA_URL} target="_blank" rel="noreferrer">
                  Grafana <ExternalLink size={13} />
                </a>
              </Button>
            )}
          </>
        }
      />

      {ageSeconds !== null && ((data?.problems?.length ?? 0) > 0 || !data) && (
        <p className={`-mt-3 text-xs ${stale || error ? "text-destructive" : "text-muted-foreground"}`} role="status">
          {host?.uptimeSeconds != null && <>Host up {uptime(host.uptimeSeconds)} · </>}
          Updated {ageSeconds}s ago{error ? " · last refresh failed" : ""}
        </p>
      )}

      {data && (
        <section className="space-y-2">
          {(data.problems?.length ?? 0) === 0 ? (
            <div className="flex items-center gap-3 rounded-xl border border-success/30 bg-success/5 px-4 py-3 text-sm text-success">
              <ProgressRing value={1} goal={1} size={42} strokeWidth={4} color="var(--success)" label={<Check size={13} />} />
              <span>
                <span className="block font-medium">{data.verdict === "unknown" ? "No active failures" : "All clear"}</span>
                <span className="text-xs text-muted-foreground">
                  {data.verdict === "unknown" ? "Goal watchdog signal is missing." : "No failing goals, containers, or delivery checks."}
                  {ageSeconds !== null ? ` Last checked ${ageSeconds}s ago.` : " Checking now."}
                </span>
              </span>
            </div>
          ) : (
            <ul className="space-y-2">
              {data.problems!.map((p) => (
                <li
                  key={`${p.kind}:${p.title}`}
                  className="flex items-start gap-3 rounded-xl border p-4"
                  style={{
                    borderColor: p.severity === "down" ? "var(--destructive)" : "var(--warning)",
                    background: `color-mix(in srgb, ${p.severity === "down" ? "var(--destructive)" : "var(--warning)"} 8%, transparent)`,
                  }}
                >
                  <AlertTriangle
                    size={18}
                    className="mt-0.5 shrink-0"
                    style={{ color: p.severity === "down" ? "var(--destructive)" : "var(--warning)" }}
                    aria-hidden
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{p.title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{p.detail}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Seen in check {ageSeconds ?? 0}s ago</p>
                    <Link
                      href={p.kind === "delivery" ? "/settings" : p.kind === "host" && GRAFANA_URL ? GRAFANA_URL : p.kind === "host" ? "#host-metrics" : p.kind === "container" ? "#container-details" : "#goal-details"}
                      target={p.kind === "host" && GRAFANA_URL ? "_blank" : undefined}
                      rel={p.kind === "host" && GRAFANA_URL ? "noreferrer" : undefined}
                      className="mt-2 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary pressable active:scale-[0.97]"
                    >
                      {p.kind === "delivery" ? "Review notifications" : p.kind === "host" && GRAFANA_URL ? "Open host metrics" : p.kind === "host" ? "Review host metrics" : p.kind === "container" ? "Review containers" : "Review goals"}
                      <ExternalLink size={13} aria-hidden="true" />
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Alerts live with health now — one surface answers "is anything
          wrong". /pager is gone; POST /api/notify is untouched. */}
      <AlertInbox />

      {error && !data && (
        <Card className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm text-destructive">
          <span>Couldn&apos;t reach the status API.</span>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={refreshing}>Retry</Button>
        </Card>
      )}

      {host ? (
        <div id="host-metrics" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <MetricCard
            icon={<Cpu size={15} />}
            label="CPU"
            percent={host.cpuPct}
            detail={host.enabled ? `load ${host.load1?.toFixed(2) ?? "–"}` : "metrics offline"}
          />
          <MetricCard
            icon={<MemoryStick size={15} />}
            label="Memory"
            percent={host.memPct}
            detail={`${gb(host.memUsedBytes)} / ${gb(host.memTotalBytes)}`}
          />
          <MetricCard
            icon={<HardDrive size={15} />}
            label="Disk /"
            percent={host.diskPct}
            detail={`${gb(host.diskUsedBytes)} / ${gb(host.diskTotalBytes)}`}
          />
        </div>
      ) : !error ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-28" />
          ))}
        </div>
      ) : null}

      {host && !host.enabled && (
        <p className="text-sm text-warning">Host metrics are offline. Container health is still available below.</p>
      )}

      <div id="system-details" className="space-y-3">
        <details id="container-details" className="group rounded-xl border border-border bg-card">
          <summary className="flex min-h-14 cursor-pointer items-center gap-3 p-4 text-sm font-medium pressable active:scale-[0.97]">
            <Boxes size={16} className="text-muted-foreground" />
            <span className="flex-1">All {containers.length} containers {running === containers.length ? "healthy" : "checked"}</span>
            <span className="font-mono text-xs text-muted-foreground tabular-nums">{running}/{containers.length}</span>
          </summary>
          {data && sorted.length === 0 ? (
            <p className="border-t border-border p-4 text-sm text-muted-foreground">No containers were returned by the status API.</p>
          ) : (
            <div className="grid gap-2 border-t border-border p-3 sm:grid-cols-2 xl:grid-cols-3">
              {sorted.map((container) => (
              <div key={container.name} className="enter flex min-w-0 flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4">
                <span
                  aria-hidden="true"
                  className="size-2 shrink-0 rounded-full"
                  style={{ background: container.up ? "var(--success)" : "var(--destructive)" }}
                />
                <Boxes size={14} className="shrink-0 text-muted-foreground/60" aria-hidden="true" />
                <span className="min-w-0 flex-1 break-words text-sm font-medium text-foreground">
                  {container.label || container.name}
                </span>
                {container.label && (
                  <span className="w-full break-all font-mono text-[10px] text-muted-foreground">{container.name}</span>
                )}
                <span className={`w-full text-xs ${container.up ? "text-muted-foreground" : "text-destructive"}`}>
                  {container.up ? `Running · ${container.status}` : `Down · ${container.state}`}
                </span>
              </div>
              ))}
            </div>
          )}
        </details>
        <details id="goal-details" className="group rounded-xl border border-border bg-card">
          <summary className="flex min-h-14 cursor-pointer items-center gap-3 p-4 text-sm font-medium pressable active:scale-[0.97]">
            <Activity size={16} className="text-muted-foreground" />
            <span className="flex-1">All {goals?.total ?? 0} goals {goals?.enabled && goals.ok === goals.total ? "passing" : "checked"}</span>
            <span className="font-mono text-xs text-muted-foreground tabular-nums">{goals?.enabled ? `${goals.ok}/${goals.total}` : "unknown"}</span>
          </summary>
          <div className="space-y-2 border-t border-border p-4 text-sm">
            {!goals?.enabled ? <p className="text-warning">Goal metrics are unavailable.</p> : goals.total === 0 ? <p className="text-muted-foreground">No standing goals reported.</p> : <p className="text-muted-foreground">{goals.ok} of {goals.total} standing goals passing.</p>}
            {goals?.lastRunAgeSeconds != null && <p className="text-xs text-muted-foreground">Watchdog ran {Math.floor(goals.lastRunAgeSeconds / 3600)}h ago.</p>}
            {goals?.violated.map((goal) => <p key={goal} className="text-destructive">Failing: {goal}</p>)}
            {goals?.flapped24h.map((goal) => <p key={goal} className="text-warning">Recovered after a dip: {goal}</p>)}
          </div>
        </details>
      </div>
    </Page>
  );
}

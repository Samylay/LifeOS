"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  Boxes,
  Cpu,
  ExternalLink,
  HardDrive,
  MemoryStick,
  RefreshCw,
} from "lucide-react";

import { CountUp } from "@/components/count-up";
import { ProgressBar } from "@/components/charts";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Page, PageHeader, SectionHeader } from "@/components/ui/page";
import { Skeleton } from "@/components/ui/skeleton";

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

interface StatusData {
  containers: { ok: boolean; containers: Container[]; reason?: string };
  host: HostMetrics;
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

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const response = await fetch("/api/status");
      if (!response.ok) throw new Error();
      setData(await response.json());
      setUpdatedAt(Date.now());
      setError(false);
    } catch {
      setError(true);
    } finally {
      setRefreshing(false);
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
    <Card className="enter gap-3 p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="section-label">{label}</span>
        <span className="ml-auto font-mono text-lg tabular-nums" style={{ color: barColor(percent) }}>
          {percent === null ? "–" : <CountUp value={Math.round(percent)} suffix="%" />}
        </span>
      </div>
      <ProgressBar value={percent ?? 0} max={100} color={barColor(percent)} />
      <p className="text-xs text-muted-foreground">{detail}</p>
    </Card>
  );
}

export default function StatusPage() {
  const { data, error, refreshing, updatedAt, now, load } = useStatus();
  const host = data?.host;
  const containers = data?.containers.containers ?? [];
  const sorted = [...containers].sort((a, b) => Number(a.up) - Number(b.up));
  const running = containers.filter((container) => container.up).length;
  const ageSeconds = updatedAt === null ? null : Math.max(0, Math.round((now - updatedAt) / 1_000));
  const stale = updatedAt !== null && now - updatedAt > STALE_AFTER_MS;

  const description = data
    ? `${running}/${containers.length} containers up${host?.uptimeSeconds != null ? ` · host up ${uptime(host.uptimeSeconds)}` : ""}`
    : "Live health for the homelab services LifeOS depends on.";

  return (
    <Page className="max-w-5xl">
      <PageHeader
        kicker="Operations"
        title="Status"
        description={description}
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

      {ageSeconds !== null && (
        <p className={`-mt-3 text-xs ${stale || error ? "text-destructive" : "text-muted-foreground"}`} role="status">
          Updated {ageSeconds}s ago{error ? " · last refresh failed" : ""}
        </p>
      )}

      {error && !data && (
        <Card className="p-4 text-sm text-destructive">
          Couldn&apos;t reach the status API. Refresh to try again.
        </Card>
      )}

      {host ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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

      <section className="space-y-3">
        <SectionHeader
          title="Containers"
          description="Failures rise to the top. Status uses text and color so it remains readable without hue."
          action={<span className="font-mono text-xs text-muted-foreground tabular-nums">{running}/{containers.length}</span>}
        />
        {data && sorted.length === 0 ? (
          <Card className="p-5 text-sm text-muted-foreground">No containers were returned by the status API.</Card>
        ) : (
          <div className="work-canvas divide-y divide-border overflow-hidden">
            {sorted.map((container) => (
              <div key={container.name} className="enter flex min-h-12 items-center gap-3 px-4 py-2.5">
                <span
                  aria-hidden="true"
                  className="size-2 shrink-0 rounded-full"
                  style={{ background: container.up ? "var(--success)" : "var(--destructive)" }}
                />
                <Boxes size={14} className="shrink-0 text-muted-foreground/60" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                  {container.label || container.name}
                </span>
                {container.label && (
                  <span className="hidden font-mono text-[10px] text-muted-foreground sm:inline">{container.name}</span>
                )}
                <span className={`max-w-[45%] truncate text-right text-xs ${container.up ? "text-muted-foreground" : "text-destructive"}`}>
                  {container.up ? `Running · ${container.status}` : `Down · ${container.state}`}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </Page>
  );
}

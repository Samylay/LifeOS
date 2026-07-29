"use client";

import { useEffect, useState, useCallback } from "react";
import { Activity, Cpu, MemoryStick, HardDrive, Boxes, ExternalLink, RefreshCw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { ProgressBar } from "@/components/charts";

// Grafana for deep dives — rendered only when a base URL is configured.
// Links straight to the provisioned Homelab dashboard rather than the Grafana home.
const GRAFANA_BASE = process.env.NEXT_PUBLIC_GRAFANA_URL?.replace(/\/$/, "");
const GRAFANA_URL = GRAFANA_BASE ? `${GRAFANA_BASE}/d/homelab/homelab` : null;

// Poll fast while the page is fresh, then back off; never poll while hidden.
const POLL_FAST_MS = 8000;
const POLL_SLOW_MS = 30000;
const POLL_FAST_WINDOW_MS = 60000;
const STALE_AFTER_MS = 30000;

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
interface Container { name: string; label?: string; up: boolean; state: string; status: string }
interface StatusData {
  containers: { ok: boolean; containers: Container[]; reason?: string };
  host: HostMetrics;
}

function gb(b: number | null): string {
  if (b === null) return "–";
  return `${(b / 1e9).toFixed(1)} GB`;
}
function uptime(s: number | null): string {
  if (s === null) return "–";
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  return d > 0 ? `${d}d ${h}h` : `${h}h`;
}
function barColor(pct: number | null): string {
  if (pct === null) return "var(--muted-foreground)";
  if (pct >= 90) return "var(--destructive)";
  if (pct >= 75) return "var(--warning)";
  return "var(--primary)";
}

function Vital({
  icon, label, pct, sub,
}: { icon: React.ReactNode; label: string; pct: number | null; sub: string }) {
  return (
    <Card className="p-4 enter">
      <div className="mb-2 flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-xs font-bold uppercase tracking-widest">{label}</span>
        <span className="ml-auto font-mono text-sm" style={{ color: barColor(pct) }}>
          {pct === null ? "–" : `${pct.toFixed(0)}%`}
        </span>
      </div>
      <ProgressBar value={pct ?? 0} max={100} color={barColor(pct)} />
      <p className="mt-1.5 text-xs text-muted-foreground">{sub}</p>
    </Card>
  );
}

export default function StatusPage() {
  // In the Capacitor wrapper, Grafana must stay in THIS WebView (its cookie
  // jar keeps the Access + grafana_session cookies, so no re-login); in a
  // desktop browser a new tab is nicer. The bridge global marks the wrapper.
  const [native, setNative] = useState(false);
  useEffect(() => {
    setNative(!!(window as { Capacitor?: unknown }).Capacitor);
  }, []);
  const [data, setData] = useState<StatusData | null>(null);
  const [err, setErr] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/status");
      if (!res.ok) throw new Error();
      setData(await res.json());
      setUpdatedAt(Date.now());
      setErr(false);
    } catch {
      setErr(true);
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
    load();
    schedule();
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  // 1s ticker so the "Updated Ns ago" line counts up between polls.
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const host = data?.host;
  const containers = data?.containers.containers ?? [];
  // Down containers first — they are the reason anyone opens this page.
  const sortedContainers = [...containers].sort((a, b) => Number(a.up) - Number(b.up));
  const running = containers.filter((c) => c.up).length;
  const ageSec = updatedAt === null ? null : Math.max(0, Math.round((Date.now() - updatedAt) / 1000));
  const stale = updatedAt !== null && Date.now() - updatedAt > STALE_AFTER_MS;

  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Activity size={22} className="text-primary" /> Status
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Homelab health · {data ? `${running}/${containers.length}` : "–"} containers up
            {host?.uptimeSeconds != null && ` · up ${uptime(host.uptimeSeconds)}`}
          </p>
          {ageSec !== null && (
            <p className={`mt-0.5 text-xs ${stale ? "text-destructive" : "text-muted-foreground/70"}`}>
              Updated {ageSec}s ago{err && " · last refresh failed"}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            disabled={refreshing}
            title="Refresh"
            aria-label="Refresh status"
            className="grid h-11 w-11 place-items-center rounded-lg bg-muted text-muted-foreground transition-transform duration-150 active:scale-[0.92] disabled:opacity-60"
          >
            <RefreshCw size={15} className={refreshing ? "animate-spin" : undefined} />
          </button>
          {GRAFANA_URL && (
            <a
              href={GRAFANA_URL}
              target={native ? "_self" : "_blank"}
              rel="noreferrer"
              className="flex items-center gap-1.5 px-2 py-2 text-sm font-medium text-muted-foreground transition-transform duration-150 active:scale-[0.97]"
            >
              Grafana <ExternalLink size={12} className="opacity-50" />
            </a>
          )}
        </div>
      </div>

      {err && !data && (
        <Card className="p-4 text-sm text-muted-foreground">Couldn&apos;t reach the status API.</Card>
      )}

      {/* Host vitals */}
      {host ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Vital icon={<Cpu size={15} />} label="CPU" pct={host.cpuPct}
            sub={host.enabled ? `load ${host.load1 != null ? host.load1.toFixed(2) : "–"}` : "metrics offline"} />
          <Vital icon={<MemoryStick size={15} />} label="Memory" pct={host.memPct}
            sub={`${gb(host.memUsedBytes)} / ${gb(host.memTotalBytes)}`} />
          <Vital icon={<HardDrive size={15} />} label="Disk /" pct={host.diskPct}
            sub={`${gb(host.diskUsedBytes)} / ${gb(host.diskTotalBytes)}`} />
        </div>
      ) : !err && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-[92px]" />
          ))}
        </div>
      )}
      {host && !host.enabled && (
        <p className="text-xs text-muted-foreground">
          Host metrics offline — is the monitoring stack (Prometheus) running?
        </p>
      )}

      {/* Containers */}
      <div>
        <div className="mb-2 flex items-center gap-2">
          <Boxes size={16} className="text-primary" />
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Containers</h2>
        </div>
        {!data && !err ? (
          <div className="space-y-1.5">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-[42px]" />
            ))}
          </div>
        ) : !data?.containers.ok ? (
          <p className="text-sm text-muted-foreground">{data?.containers.reason || "Loading…"}</p>
        ) : (
          <div className="space-y-1.5">
            {sortedContainers.map((c) => (
              <Card key={c.name} className="enter flex flex-row items-center gap-3 rounded-lg px-3 py-2">
                {/* The glow belongs on the problem: down containers pulse
                    destructive, healthy ones sit quiet. */}
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{
                    background: c.up ? "var(--success)" : "var(--destructive)",
                    boxShadow: c.up ? "none" : "0 0 6px -1px var(--destructive)",
                  }}
                />
                <span className="text-sm font-medium">{c.label || c.name}</span>
                {c.label && <span className="font-mono text-[10px] text-muted-foreground">{c.name}</span>}
                <span className={`ml-auto truncate text-xs ${c.up ? "text-muted-foreground" : "text-destructive"}`}>
                  {c.up ? c.status : c.state}
                </span>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

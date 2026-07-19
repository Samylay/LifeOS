"use client";

import { useEffect, useState, useCallback } from "react";
import { Activity, Cpu, MemoryStick, HardDrive, Boxes, ExternalLink, Sparkles, RefreshCw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { ProgressBar } from "@/components/charts";

// Grafana for deep dives. Reachable once it has a Cloudflare route (pending the
// tunnel-token refresh); override the base with NEXT_PUBLIC_GRAFANA_URL.
// Links straight to the provisioned Homelab dashboard rather than the Grafana home.
const GRAFANA_BASE = (process.env.NEXT_PUBLIC_GRAFANA_URL || "https://grafana.samylayaida.com").replace(/\/$/, "");
const GRAFANA_URL = `${GRAFANA_BASE}/d/homelab/homelab`;

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
interface Hermes { ok: boolean; reason?: string; lastRun?: string | null; lastFile?: string | null; processed?: number; ranToday?: boolean }
interface StatusData {
  containers: { ok: boolean; containers: Container[]; reason?: string };
  host: HostMetrics;
  hermes: Hermes;
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
  if (pct >= 75) return "var(--chart-3)";
  return "var(--primary)";
}

function Vital({
  icon, label, pct, sub,
}: { icon: React.ReactNode; label: string; pct: number | null; sub: string }) {
  return (
    <Card className="p-4">
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

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/status");
      if (!res.ok) throw new Error();
      setData(await res.json());
      setErr(false);
    } catch {
      setErr(true);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [load]);

  const host = data?.host;
  const containers = data?.containers.containers ?? [];
  const running = containers.filter((c) => c.up).length;

  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Activity size={22} className="text-primary" /> Status
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Homelab health · {running}/{containers.length} containers up
            {host?.uptimeSeconds != null && ` · up ${uptime(host.uptimeSeconds)}`}
            {host?.load1 != null && ` · load ${host.load1.toFixed(2)}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            title="Refresh"
            aria-label="Refresh status"
            className="rounded-lg bg-muted p-2 text-muted-foreground transition-transform duration-150 active:scale-[0.92]"
          >
            <RefreshCw size={15} />
          </button>
          {GRAFANA_URL && (
            <a
              href={GRAFANA_URL}
              target={native ? "_self" : "_blank"}
              rel="noreferrer"
              className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground"
            >
              <Sparkles size={14} /> Open Grafana <ExternalLink size={12} className="opacity-50" />
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
            sub={host.enabled ? "16 threads" : "metrics offline"} />
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
            {containers.map((c) => (
              <Card key={c.name} className="flex flex-row items-center gap-3 rounded-lg px-3 py-2">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{
                    background: c.up ? "#22C55E" : "var(--destructive)",
                    boxShadow: c.up ? "0 0 6px -1px #22C55E" : "none",
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

      {/* Hermes */}
      {data?.hermes && (
        <Card className="flex flex-row items-center gap-2 p-3 text-xs text-muted-foreground">
          <Activity size={13} className={data.hermes.ranToday ? "text-emerald-500" : "text-muted-foreground"} />
          {data.hermes.ok
            ? `Hermes: ${data.hermes.processed ?? 0} notes enriched · last run ${data.hermes.lastRun ? new Date(data.hermes.lastRun).toLocaleString() : "—"}${data.hermes.ranToday ? " · ran today ✓" : ""}`
            : `Hermes: ${data.hermes.reason}`}
        </Card>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState, useCallback } from "react";
import { Activity, Cpu, MemoryStick, HardDrive, Boxes, ExternalLink, Sparkles, RefreshCw } from "lucide-react";

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
  if (pct === null) return "var(--text-tertiary)";
  if (pct >= 90) return "#EF4444";
  if (pct >= 75) return "#F59E0B";
  return "var(--accent)";
}

function Vital({
  icon, label, pct, sub,
}: { icon: React.ReactNode; label: string; pct: number | null; sub: string }) {
  return (
    <div className="rounded-xl p-4" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}>
      <div className="flex items-center gap-2 mb-2" style={{ color: "var(--text-secondary)" }}>
        {icon}
        <span className="text-xs font-bold uppercase tracking-widest">{label}</span>
        <span className="ml-auto text-sm font-mono" style={{ color: barColor(pct) }}>
          {pct === null ? "–" : `${pct.toFixed(0)}%`}
        </span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--bg-tertiary)" }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct ?? 0}%`, background: barColor(pct) }} />
      </div>
      <p className="text-xs mt-1.5" style={{ color: "var(--text-tertiary)" }}>{sub}</p>
    </div>
  );
}

export default function StatusPage() {
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
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
            <Activity size={22} style={{ color: "var(--accent)" }} /> Status
          </h1>
          <p className="text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>
            Homelab health · {running}/{containers.length} containers up
            {host?.uptimeSeconds != null && ` · up ${uptime(host.uptimeSeconds)}`}
            {host?.load1 != null && ` · load ${host.load1.toFixed(2)}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} title="Refresh" className="p-2 rounded-lg" style={{ color: "var(--text-tertiary)", background: "var(--bg-tertiary)" }}>
            <RefreshCw size={15} />
          </button>
          {GRAFANA_URL && (
            <a href={GRAFANA_URL} target="_blank" rel="noreferrer"
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium"
              style={{ color: "var(--accent)", background: "var(--accent-bg)" }}>
              <Sparkles size={14} /> Open Grafana <ExternalLink size={12} className="opacity-50" />
            </a>
          )}
        </div>
      </div>

      {err && !data && (
        <div className="rounded-xl p-4 text-sm" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)", color: "var(--text-secondary)" }}>
          Couldn&apos;t reach the status API.
        </div>
      )}

      {/* Host vitals */}
      {host && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Vital icon={<Cpu size={15} />} label="CPU" pct={host.cpuPct}
            sub={host.enabled ? "16 threads" : "metrics offline"} />
          <Vital icon={<MemoryStick size={15} />} label="Memory" pct={host.memPct}
            sub={`${gb(host.memUsedBytes)} / ${gb(host.memTotalBytes)}`} />
          <Vital icon={<HardDrive size={15} />} label="Disk /" pct={host.diskPct}
            sub={`${gb(host.diskUsedBytes)} / ${gb(host.diskTotalBytes)}`} />
        </div>
      )}
      {host && !host.enabled && (
        <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
          Host metrics offline — is the monitoring stack (Prometheus) running?
        </p>
      )}

      {/* Containers */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Boxes size={16} style={{ color: "var(--accent)" }} />
          <h2 className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--text-secondary)" }}>
            Containers
          </h2>
        </div>
        {!data?.containers.ok ? (
          <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
            {data?.containers.reason || "Loading…"}
          </p>
        ) : (
          <div className="space-y-1.5">
            {containers.map((c) => (
              <div key={c.name} className="flex items-center gap-3 rounded-lg px-3 py-2"
                style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}>
                <span className="shrink-0 h-2.5 w-2.5 rounded-full" style={{
                  background: c.up ? "#22C55E" : "#EF4444",
                  boxShadow: c.up ? "0 0 6px -1px #22C55E" : "none",
                }} />
                <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                  {c.label || c.name}
                </span>
                {c.label && <span className="text-[10px] font-mono" style={{ color: "var(--text-tertiary)" }}>{c.name}</span>}
                <span className="text-xs ml-auto truncate" style={{ color: c.up ? "var(--text-tertiary)" : "#EF4444" }}>
                  {c.up ? c.status : c.state}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Hermes */}
      {data?.hermes && (
        <div className="rounded-xl p-3 flex items-center gap-2 text-xs"
          style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)", color: "var(--text-secondary)" }}>
          <Activity size={13} style={{ color: data.hermes.ranToday ? "#22C55E" : "var(--text-tertiary)" }} />
          {data.hermes.ok
            ? `Hermes: ${data.hermes.processed ?? 0} notes enriched · last run ${data.hermes.lastRun ? new Date(data.hermes.lastRun).toLocaleString() : "—"}${data.hermes.ranToday ? " · ran today ✓" : ""}`
            : `Hermes: ${data.hermes.reason}`}
        </div>
      )}
    </div>
  );
}

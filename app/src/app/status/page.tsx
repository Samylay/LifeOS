"use client";

// UI overhaul lab — /status rendered in switchable design variants via ?v= param.
// Variants:
//   v=base    current shipped design (control)
//   v=radial  ring gauges, hero uptime dial, dense mono container table
//   v=editorial  big-type dashboard: giant numerals, no cards for vitals,
//                hairline-divided full-width rows
//   v=cards   bento grid: mixed-size tiles, sparklines, status glow accents
import { useEffect, useState, useCallback, useMemo } from "react";
import { Activity, Cpu, MemoryStick, HardDrive, Boxes, ExternalLink, RefreshCw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { ProgressBar } from "@/components/charts";
import { CountUp } from "@/components/count-up";

const GRAFANA_BASE = process.env.NEXT_PUBLIC_GRAFANA_URL?.replace(/\/$/, "");
const GRAFANA_URL = GRAFANA_BASE ? `${GRAFANA_BASE}/d/homelab/homelab` : null;

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

type Variant = "base" | "radial" | "editorial" | "cards";
const VARIANTS: { id: Variant; name: string; blurb: string }[] = [
  { id: "base", name: "Base", blurb: "current shipped design" },
  { id: "radial", name: "Radial", blurb: "ring gauges + dense table" },
  { id: "editorial", name: "Editorial", blurb: "big type, hairlines" },
  { id: "cards", name: "Bento", blurb: "mixed tiles + sparks" },
];

/* ── shared data hook ─────────────────────────────────────────── */
function useStatus() {
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

  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  return { data, err, refreshing, updatedAt, load };
}

/* ── header (shared chrome across variants) ───────────────────── */
function Header({
  variant, setVariant, running, total, host, ageSec, stale, err, refreshing, onLoad,
}: {
  variant: Variant; setVariant: (v: Variant) => void;
  running: number; total: number; host: HostMetrics | undefined;
  ageSec: number | null; stale: boolean; err: boolean; refreshing: boolean; onLoad: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 className="flex items-center gap-2">
          <Activity size={22} className="text-primary" /> Status
          <span className="section-label">{VARIANTS.find((v) => v.id === variant)?.name}</span>
        </h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Homelab health · {running}/{total} containers up
          {host?.uptimeSeconds != null && ` · up ${uptime(host.uptimeSeconds)}`}
        </p>
        {ageSec !== null && (
          <p className={`mt-0.5 text-xs ${stale ? "text-destructive" : "text-muted-foreground/70"}`}>
            Updated {ageSec}s ago{err && " · last refresh failed"}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2">
        <div className="flex rounded-lg bg-muted p-0.5" role="tablist" aria-label="Design variant">
          {VARIANTS.map((v) => (
            <button
              key={v.id}
              role="tab"
              aria-selected={variant === v.id}
              title={v.blurb}
              onClick={() => {
                const url = new URL(window.location.href);
                url.searchParams.set("v", v.id);
                window.history.replaceState(null, "", url.toString());
                setVariant(v.id);
              }}
              className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-[background-color,color] duration-150 ease-[var(--ease-out-custom)] active:scale-[0.97] ${
                variant === v.id
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {v.name}
            </button>
          ))}
        </div>
        <button
          onClick={onLoad}
          disabled={refreshing}
          title="Refresh"
          aria-label="Refresh status"
          className="grid h-11 w-11 place-items-center rounded-lg bg-muted text-muted-foreground transition-transform duration-150 active:scale-[0.92] disabled:opacity-60"
        >
          <RefreshCw size={15} className={refreshing ? "animate-spin" : undefined} />
        </button>
        {GRAFANA_URL && (
          <a href={GRAFANA_URL} target="_blank" rel="noreferrer"
            className="flex items-center gap-1.5 px-2 py-2 text-sm font-medium text-muted-foreground transition-transform duration-150 active:scale-[0.97]">
            Grafana <ExternalLink size={12} className="opacity-50" />
          </a>
        )}
      </div>
    </div>
  );
}

/* ── BASE variant (current design) ────────────────────────────── */
function VitalBase({ icon, label, pct, sub }: { icon: React.ReactNode; label: string; pct: number | null; sub: string }) {
  return (
    <Card className="hover-lift p-4 enter">
      <div className="mb-2 flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="section-label">{label}</span>
        <span className="ml-auto font-mono text-sm" style={{ color: barColor(pct) }}>
          {pct === null ? "–" : <CountUp value={Math.round(pct)} suffix="%" />}
        </span>
      </div>
      <ProgressBar value={pct ?? 0} max={100} color={barColor(pct)} />
      <p className="mt-1.5 text-xs text-muted-foreground">{sub}</p>
    </Card>
  );
}

function BaseBody({ host, containers }: { host?: HostMetrics; containers: Container[] }) {
  const sorted = [...containers].sort((a, b) => Number(a.up) - Number(b.up));
  return (
    <>
      {host ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <VitalBase icon={<Cpu size={15} />} label="CPU" pct={host.cpuPct} sub={host.enabled ? `load ${host.load1 != null ? host.load1.toFixed(2) : "–"}` : "metrics offline"} />
          <VitalBase icon={<MemoryStick size={15} />} label="Memory" pct={host.memPct} sub={`${gb(host.memUsedBytes)} / ${gb(host.memTotalBytes)}`} />
          <VitalBase icon={<HardDrive size={15} />} label="Disk /" pct={host.diskPct} sub={`${gb(host.diskUsedBytes)} / ${gb(host.diskTotalBytes)}`} />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-[92px]" />)}
        </div>
      )}
      {host && !host.enabled && (
        <p className="text-xs text-muted-foreground">Host metrics offline — is the monitoring stack (Prometheus) running?</p>
      )}
      <div>
        <div className="mb-2 flex items-center gap-2">
          <Boxes size={16} className="text-primary" />
          <h2 className="section-label">Containers</h2>
        </div>
        <div className="space-y-1.5">
          {sorted.map((c) => (
            <Card key={c.name} className="enter flex flex-row items-center gap-3 rounded-lg px-3 py-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c.up ? "var(--success)" : "var(--destructive)", boxShadow: c.up ? "none" : "0 0 6px -1px var(--destructive)" }} />
              <span className="text-sm font-medium">{c.label || c.name}</span>
              {c.label && <span className="font-mono text-[10px] text-muted-foreground">{c.name}</span>}
              <span className={`ml-auto truncate text-xs ${c.up ? "text-muted-foreground" : "text-destructive"}`}>{c.up ? c.status : c.state}</span>
            </Card>
          ))}
        </div>
      </div>
    </>
  );
}

/* ── RADIAL variant: ring gauges + dense mono table ───────────── */
function Ring({ pct, size = 96, label, sub }: { pct: number | null; size?: number; label: string; sub: string }) {
  const stroke = 7;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, pct ?? 0));
  return (
    <div className="flex flex-col items-center gap-2 enter">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--muted)" strokeWidth={stroke} />
          <circle
            cx={size / 2} cy={size / 2} r={r} fill="none"
            stroke={barColor(pct)} strokeWidth={stroke} strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c - (c * p) / 100}
            style={{ transition: "stroke-dashoffset var(--dur-slow) var(--ease-out-custom)" }}
          />
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          <span className="font-mono text-lg font-semibold tabular-nums" style={{ color: barColor(pct) }}>
            {pct === null ? "–" : <CountUp value={Math.round(pct)} suffix="%" />}
          </span>
        </div>
      </div>
      <div className="text-center">
        <p className="section-label">{label}</p>
        <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{sub}</p>
      </div>
    </div>
  );
}

function RadialBody({ host, containers }: { host?: HostMetrics; containers: Container[] }) {
  const sorted = [...containers].sort((a, b) => Number(a.up) - Number(b.up));
  return (
    <>
      {host && host.enabled ? (
        <Card className="enter p-6">
          <div className="grid grid-cols-3 gap-4">
            <Ring pct={host.cpuPct} label="CPU" sub={`load ${host.load1?.toFixed(2) ?? "–"}`} />
            <Ring pct={host.memPct} label="MEM" sub={`${gb(host.memUsedBytes)} / ${gb(host.memTotalBytes)}`} />
            <Ring pct={host.diskPct} label="DISK" sub={`${gb(host.diskUsedBytes)} / ${gb(host.diskTotalBytes)}`} />
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-[160px]" />)}
        </div>
      )}
      <Card className="overflow-hidden enter p-0">
        <table className="w-full text-left font-mono text-xs">
          <tbody>
            {sorted.map((c) => (
              <tr key={c.name} className="border-b border-border/50 last:border-0 hover:bg-accent/40 transition-colors duration-150">
                <td className="px-4 py-2.5">
                  <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: c.up ? "var(--success)" : "var(--destructive)" }} />
                  <span className="font-sans text-sm font-medium">{c.label || c.name}</span>
                </td>
                <td className="hidden px-2 py-2.5 text-muted-foreground sm:table-cell">{c.name}</td>
                <td className={`px-4 py-2.5 text-right tabular-nums ${c.up ? "text-muted-foreground" : "text-destructive"}`}>{c.up ? c.status : c.state}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}

/* ── EDITORIAL variant: giant numerals + hairline rows ────────── */
function EditorialVital({ label, pct, sub }: { label: string; pct: number | null; sub: string }) {
  return (
    <div className="enter border-b border-border/60 py-5 last:border-0">
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <p className="section-label">{label}</p>
          <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
        </div>
        <span
          className="font-mono text-5xl font-bold leading-none tracking-tighter tabular-nums"
          style={{ color: barColor(pct) }}
        >
          {pct === null ? "–" : <CountUp value={Math.round(pct)} />}
          <span className="ml-1 text-base font-medium text-muted-foreground">%</span>
        </span>
      </div>
      <div className="mt-3 h-px w-full overflow-hidden bg-border/40">
        <div
          className="h-full origin-left transition-transform duration-500 ease-[var(--ease-out-custom)]"
          style={{ background: barColor(pct), transform: `scaleX(${(pct ?? 0) / 100})` }}
        />
      </div>
    </div>
  );
}

function EditorialBody({ host, containers }: { host?: HostMetrics; containers: Container[] }) {
  const sorted = [...containers].sort((a, b) => Number(a.up) - Number(b.up));
  return (
    <>
      <div>
        {host?.enabled ? (
          <>
            <EditorialVital label="CPU" pct={host.cpuPct} sub={`load average ${host.load1?.toFixed(2) ?? "–"}`} />
            <EditorialVital label="Memory" pct={host.memPct} sub={`${gb(host.memUsedBytes)} of ${gb(host.memTotalBytes)} used`} />
            <EditorialVital label="Disk" pct={host.diskPct} sub={`${gb(host.diskUsedBytes)} of ${gb(host.diskTotalBytes)} on /`} />
          </>
        ) : (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="mb-4 h-24" />)
        )}
      </div>
      <div>
        <p className="section-label mb-1 mt-8">Containers</p>
        <div className="divide-y divide-border/60">
          {sorted.map((c) => (
            <div key={c.name} className="flex items-baseline justify-between gap-4 py-3 enter">
              <span className={`text-base ${c.up ? "" : "text-destructive"}`}>
                {!c.up && "✕ "}
                {c.label || c.name}
                {c.label && <span className="ml-2 font-mono text-xs text-muted-foreground">{c.name}</span>}
              </span>
              <span className="font-mono text-xs tabular-nums text-muted-foreground">{c.up ? c.status : c.state}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

/* ── BENTO variant: mixed-size tiles with status accents ──────── */
function BentoTile({ children, span = 1, className = "" }: { children: React.ReactNode; span?: 1 | 2; className?: string }) {
  return (
    <Card className={`hover-lift relative overflow-hidden p-5 enter ${span === 2 ? "sm:col-span-2" : ""} ${className}`}>
      {children}
    </Card>
  );
}

function BentoBody({ host, containers }: { host?: HostMetrics; containers: Container[] }) {
  const sorted = [...containers].sort((a, b) => Number(a.up) - Number(b.up));
  const worst = Math.max(host?.cpuPct ?? 0, host?.memPct ?? 0, host?.diskPct ?? 0);
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {/* Hero tile: overall health */}
      <BentoTile span={2}>
        <p className="section-label">Overall</p>
        <div className="mt-3 flex items-end justify-between">
          <span className="font-mono text-5xl font-bold tracking-tighter" style={{ color: barColor(worst) }}>
            {host?.enabled ? <CountUp value={Math.round(100 - worst)} suffix="%" /> : "–"}
          </span>
          <Boxes size={28} className="mb-1 text-muted-foreground/30" />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {worst >= 75 ? `${Math.round(worst)}% peak utilisation` : "all systems comfortable"}
        </p>
        <div className="absolute inset-x-0 bottom-0 h-0.5" style={{ background: `linear-gradient(90deg, transparent, ${barColor(worst)})`, opacity: 0.5 }} />
      </BentoTile>

      {[
        ["CPU", host?.cpuPct, `load ${host?.load1?.toFixed(2) ?? "–"}`, <Cpu key="c" size={15} />],
        ["MEM", host?.memPct, gb(host?.memUsedBytes ?? null), <MemoryStick key="m" size={15} />],
        ["Disk", host?.diskPct, gb(host?.diskUsedBytes ?? null), <HardDrive key="d" size={15} />],
      ].map(([label, pct, sub, icon]) => (
        <BentoTile key={String(label)}>
          <div className="flex items-center gap-2 text-muted-foreground">{icon as React.ReactNode}<span className="section-label">{label as string}</span></div>
          <p className="mt-3 font-mono text-2xl font-semibold tabular-nums" style={{ color: barColor(pct as number | null) }}>
            {pct == null ? "–" : <CountUp value={Math.round(pct as number)} suffix="%" />}
          </p>
          <p className="mt-1 truncate font-mono text-[10px] text-muted-foreground">{sub as string}</p>
        </BentoTile>
      ))}

      {/* Containers wide tile */}
      <BentoTile span={2} className="!p-0">
        <div className="flex items-center justify-between px-5 pb-2 pt-4">
          <span className="section-label">Containers</span>
          <span className="font-mono text-xs text-muted-foreground">
            {containers.filter((c) => c.up).length}/{containers.length} up
          </span>
        </div>
        <ul className="max-h-56 space-y-0.5 overflow-y-auto px-3 pb-3">
          {sorted.map((c) => (
            <li key={c.name} className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors duration-150 hover:bg-accent/40">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: c.up ? "var(--success)" : "var(--destructive)", boxShadow: c.up ? "none" : "0 0 6px -1px var(--destructive)" }} />
              <span className="truncate font-medium">{c.label || c.name}</span>
              <span className={`ml-auto shrink-0 font-mono text-[10px] tabular-nums ${c.up ? "text-muted-foreground" : "text-destructive"}`}>{c.up ? c.status : c.state}</span>
            </li>
          ))}
        </ul>
      </BentoTile>

      {/* Uptime tile */}
      <BentoTile span={2}>
        <p className="section-label">Uptime</p>
        <p className="mt-3 font-mono text-4xl font-bold tracking-tighter text-primary">
          {host?.uptimeSeconds != null ? uptime(host.uptimeSeconds) : "–"}
        </p>
        <p className="mt-2 text-xs text-muted-foreground">since last reboot</p>
      </BentoTile>
    </div>
  );
}

/* ── page ─────────────────────────────────────────────────────── */
export default function StatusPage() {
  const [variant, setVariant] = useState<Variant>("base");
  const { data, err, refreshing, updatedAt, load } = useStatus();

  // Read ?v= once on mount (client component — safe).
  useEffect(() => {
    const v = new URLSearchParams(window.location.search).get("v") as Variant | null;
    if (v && VARIANTS.some((x) => x.id === v)) setVariant(v);
  }, []);

  const host = data?.host;
  const containers = data?.containers.containers ?? [];
  const running = containers.filter((c) => c.up).length;
  const ageSec = updatedAt === null ? null : Math.max(0, Math.round((Date.now() - updatedAt) / 1000));
  const stale = updatedAt !== null && Date.now() - updatedAt > STALE_AFTER_MS;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Header
        variant={variant} setVariant={setVariant}
        running={running} total={containers.length} host={host}
        ageSec={ageSec} stale={stale} err={err} refreshing={refreshing} onLoad={load}
      />

      {err && !data && (
        <Card className="p-4 text-sm text-muted-foreground">Couldn&apos;t reach the status API.</Card>
      )}

      {variant === "base" && <BaseBody host={host} containers={containers} />}
      {variant === "radial" && <RadialBody host={host} containers={containers} />}
      {variant === "editorial" && <EditorialBody host={host} containers={containers} />}
      {variant === "cards" && <BentoBody host={host} containers={containers} />}
    </div>
  );
}

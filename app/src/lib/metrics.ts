// Server-side only — host vitals read from Prometheus (the monitoring stack at
// ~/infra/monitoring). LifeOS reaches it via host.docker.internal:9090.
const PROM_URL = process.env.PROM_URL || "http://host.docker.internal:9090";

async function instant(expr: string): Promise<number | null> {
  try {
    const url = `${PROM_URL}/api/v1/query?query=${encodeURIComponent(expr)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const json = await res.json();
    const r = json?.data?.result;
    if (!r || r.length === 0) return null;
    const v = Number(r[0].value[1]);
    return Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

async function instantVector(
  expr: string
): Promise<{ labels: Record<string, string>; value: number }[] | null> {
  try {
    const url = `${PROM_URL}/api/v1/query?query=${encodeURIComponent(expr)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const json = await res.json();
    const r = json?.data?.result;
    if (!Array.isArray(r)) return null;
    return r
      .map((s: { metric: Record<string, string>; value: [number, string] }) => ({
        labels: s.metric,
        value: Number(s.value[1]),
      }))
      .filter((s) => Number.isFinite(s.value));
  } catch {
    return null;
  }
}

export interface StandingGoals {
  enabled: boolean; // false when the metrics aren't in Prometheus at all
  total: number;
  ok: number;
  violated: string[]; // currently failing
  flapped24h: string[]; // ok now, but violated at some point in the last 24h
  lastRunAgeSeconds: number | null;
}

/** Standing-goals invariants (~/infra/goals) as scraped from node_exporter's
 *  textfile collector. `flapped24h` surfaces overnight dips the 06:00 brief
 *  would otherwise never see (transition alerts fire at night; this is the
 *  morning recap). */
export async function getStandingGoals(): Promise<StandingGoals> {
  const [now, floor24h, runAge] = await Promise.all([
    instantVector("homelab_goal_up"),
    instantVector("min_over_time(homelab_goal_up[24h])"),
    instant("time() - homelab_goals_last_run_timestamp_seconds"),
  ]);

  if (!now || now.length === 0) {
    return { enabled: false, total: 0, ok: 0, violated: [], flapped24h: [], lastRunAgeSeconds: runAge };
  }

  const violated = now.filter((g) => g.value < 1).map((g) => g.labels.goal ?? "?");
  const okNow = new Set(now.filter((g) => g.value >= 1).map((g) => g.labels.goal ?? "?"));
  const flapped24h = (floor24h ?? [])
    .filter((g) => g.value < 1)
    .map((g) => g.labels.goal ?? "?")
    .filter((goal) => okNow.has(goal));

  return {
    enabled: true,
    total: now.length,
    ok: okNow.size,
    violated,
    flapped24h,
    lastRunAgeSeconds: runAge,
  };
}

export interface HostMetrics {
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

const DISK = '{mountpoint="/",fstype!="tmpfs"}';

export async function getHostMetrics(): Promise<HostMetrics> {
  const [cpu, memTotal, memAvail, diskTotal, diskAvail, load1, uptime] = await Promise.all([
    instant('100 - (avg(rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)'),
    instant("node_memory_MemTotal_bytes"),
    instant("node_memory_MemAvailable_bytes"),
    instant(`node_filesystem_size_bytes${DISK}`),
    instant(`node_filesystem_avail_bytes${DISK}`),
    instant("node_load1"),
    instant("node_time_seconds - node_boot_time_seconds"),
  ]);

  const enabled = [cpu, memTotal, diskTotal].some((v) => v !== null);
  const memUsedBytes = memTotal !== null && memAvail !== null ? memTotal - memAvail : null;
  const memPct = memTotal && memUsedBytes !== null ? (memUsedBytes / memTotal) * 100 : null;
  const diskUsedBytes = diskTotal !== null && diskAvail !== null ? diskTotal - diskAvail : null;
  const diskPct = diskTotal && diskUsedBytes !== null ? (diskUsedBytes / diskTotal) * 100 : null;

  return {
    enabled,
    cpuPct: cpu,
    memPct,
    memUsedBytes,
    memTotalBytes: memTotal,
    diskPct,
    diskUsedBytes,
    diskTotalBytes: diskTotal,
    load1,
    uptimeSeconds: uptime,
  };
}

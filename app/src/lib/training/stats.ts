// Training analytics — pure stats over Strava activity rows.
// Ported 2026-07-07 from ~/dashboards/strava-dashboard (retired) onto
// LifeOS's live /api/strava data. ActivityRow structurally matches the
// rows served by /api/strava/activities (components/training-stats.ts is
// a superset). db-coupled PR persistence was left behind: LifeOS does not
// sync activity streams (see ROADMAP task for per-activity views).

export interface ActivityRow {
  id: number;
  name: string;
  sport_type: string;
  start_date: string;
  start_date_local: string | null;
  distance_m: number;
  moving_time_s: number;
  elapsed_time_s: number;
  total_elevation_gain_m: number;
  average_speed_mps: number | null;
  max_speed_mps: number | null;
  average_heartrate: number | null;
  max_heartrate: number | null;
  average_cadence: number | null;
  average_watts: number | null;
  kilojoules: number | null;
  kudos_count: number;
  achievement_count: number;
  polyline: string | null;
  start_lat: number | null;
  start_lng: number | null;
}

// ---------- KPIs ----------

export interface Kpis {
  distance: number;
  time: number;
  elevation: number;
  count: number;
  weeklyAvgDistance: number;
}

export function kpisForActivities(rows: ActivityRow[], periodDays: number): Kpis {
  let distance = 0;
  let time = 0;
  let elevation = 0;
  for (const r of rows) {
    distance += r.distance_m ?? 0;
    time += r.moving_time_s ?? 0;
    elevation += r.total_elevation_gain_m ?? 0;
  }
  const weeks = Math.max(periodDays / 7, 1);
  return {
    distance,
    time,
    elevation,
    count: rows.length,
    weeklyAvgDistance: distance / weeks,
  };
}

// ---------- Streak ----------

export function currentStreak(rows: ActivityRow[], today = new Date()): number {
  if (rows.length === 0) return 0;
  const days = new Set<string>();
  for (const r of rows) {
    const d = new Date(r.start_date_local ?? r.start_date);
    days.add(d.toISOString().slice(0, 10));
  }
  let streak = 0;
  const cursor = new Date(today);
  cursor.setUTCHours(0, 0, 0, 0);
  // allow today to be missing — start counting from yesterday in that case
  if (!days.has(cursor.toISOString().slice(0, 10))) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  while (days.has(cursor.toISOString().slice(0, 10))) {
    streak++;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

// ---------- Buckets ----------

export type BucketKey = "distance_m" | "moving_time_s" | "total_elevation_gain_m" | "count";

export interface WeekBucket {
  weekStart: string; // ISO date (Monday)
  value: number;
  count: number;
}

export function isoWeekStart(d: Date): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = x.getUTCDay() || 7;
  if (day !== 1) x.setUTCDate(x.getUTCDate() - (day - 1));
  return x;
}

export function isoWeekKey(d: Date): string {
  return isoWeekStart(d).toISOString().slice(0, 10);
}

export function weeklyBuckets(rows: ActivityRow[], key: BucketKey): WeekBucket[] {
  const map = new Map<string, { value: number; count: number }>();
  for (const r of rows) {
    const d = new Date(r.start_date_local ?? r.start_date);
    const ws = isoWeekStart(d).toISOString().slice(0, 10);
    const v = key === "count" ? 1 : (r[key] ?? 0);
    const cur = map.get(ws) ?? { value: 0, count: 0 };
    cur.value += v;
    cur.count += 1;
    map.set(ws, cur);
  }
  return Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([weekStart, v]) => ({ weekStart, ...v }));
}

export function dailyDistance(rows: ActivityRow[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    const d = (r.start_date_local ?? r.start_date).slice(0, 10);
    m.set(d, (m.get(d) ?? 0) + (r.distance_m ?? 0));
  }
  return m;
}

export function rollingAverage(series: number[], window = 4): (number | null)[] {
  const out: (number | null)[] = [];
  for (let i = 0; i < series.length; i++) {
    if (i + 1 < window) {
      out.push(null);
      continue;
    }
    let sum = 0;
    for (let j = i - window + 1; j <= i; j++) sum += series[j];
    out.push(sum / window);
  }
  return out;
}

// ---------- HR Zones ----------

export interface HrZones {
  z1: number;
  z2: number;
  z3: number;
  z4: number;
  z5: number;
}

export function hrZoneBuckets(hr: number[] | null, time: number[] | null, maxHr: number): HrZones {
  const out: HrZones = { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 };
  if (!hr || hr.length === 0) return out;
  for (let i = 0; i < hr.length; i++) {
    const dt = time && i > 0 ? time[i] - time[i - 1] : 1;
    const pct = (hr[i] / maxHr) * 100;
    if (pct < 60) out.z1 += dt;
    else if (pct < 70) out.z2 += dt;
    else if (pct < 80) out.z3 += dt;
    else if (pct < 90) out.z4 += dt;
    else out.z5 += dt;
  }
  return out;
}

// ---------- Personal records (sliding window over distance/time streams) ----------

export const PR_DISTANCES_RUN = [1000, 5000, 10000, 21097, 42195];

export function bestEffortsForStreams(
  distance: number[],
  time: number[],
  targets: number[]
): Map<number, number> {
  // For each target distance, find the minimum time window that covers >= target meters.
  const out = new Map<number, number>();
  if (distance.length < 2 || time.length < 2) return out;

  for (const target of targets) {
    let best = Infinity;
    let j = 0;
    for (let i = 0; i < distance.length; i++) {
      if (j < i) j = i;
      while (j < distance.length && distance[j] - distance[i] < target) j++;
      if (j >= distance.length) break;
      const dt = time[j] - time[i];
      if (dt > 0 && dt < best) best = dt;
    }
    if (Number.isFinite(best)) out.set(target, best);
  }
  return out;
}

// ---------- Distributions ----------

export interface HistBin {
  label: string;
  start: number;
  end: number;
  count: number;
}

export function paceHistogram(rows: ActivityRow[], sportFilter: string, bucketSec = 15): HistBin[] {
  const filtered = rows.filter((r) => r.sport_type === sportFilter && r.average_speed_mps);
  if (filtered.length === 0) return [];
  const paces = filtered.map((r) => 1000 / (r.average_speed_mps as number)); // sec/km
  const min = Math.min(...paces);
  const max = Math.max(...paces);
  const start = Math.floor(min / bucketSec) * bucketSec;
  const end = Math.ceil(max / bucketSec) * bucketSec;
  const bins: HistBin[] = [];
  for (let s = start; s < end; s += bucketSec) {
    bins.push({
      label: `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`,
      start: s,
      end: s + bucketSec,
      count: 0,
    });
  }
  for (const p of paces) {
    const idx = Math.min(Math.floor((p - start) / bucketSec), bins.length - 1);
    if (idx >= 0) bins[idx].count++;
  }
  return bins;
}

export function hrHistogram(rows: ActivityRow[], bucketBpm = 5): HistBin[] {
  const hrs = rows.map((r) => r.average_heartrate).filter((h): h is number => h != null);
  if (hrs.length === 0) return [];
  const min = Math.min(...hrs);
  const max = Math.max(...hrs);
  const start = Math.floor(min / bucketBpm) * bucketBpm;
  const end = Math.ceil(max / bucketBpm) * bucketBpm;
  const bins: HistBin[] = [];
  for (let s = start; s < end; s += bucketBpm) {
    bins.push({ label: `${s}`, start: s, end: s + bucketBpm, count: 0 });
  }
  for (const h of hrs) {
    const idx = Math.min(Math.floor((h - start) / bucketBpm), bins.length - 1);
    if (idx >= 0) bins[idx].count++;
  }
  return bins;
}

// ---------- Compare ----------

export interface CompareResult {
  aTotal: number;
  bTotal: number;
  deltaPct: number;
  aWeekly: number[];
  bWeekly: number[];
}

export function comparePeriods(
  aRows: ActivityRow[],
  bRows: ActivityRow[],
  key: BucketKey
): CompareResult {
  const sum = (rs: ActivityRow[]) =>
    rs.reduce((acc, r) => acc + (key === "count" ? 1 : (r[key] ?? 0)), 0);
  const aTotal = sum(aRows);
  const bTotal = sum(bRows);
  const deltaPct = bTotal === 0 ? 0 : ((aTotal - bTotal) / bTotal) * 100;

  const groupByWeekIdx = (rows: ActivityRow[]) => {
    if (rows.length === 0) return [];
    const sorted = [...rows].sort((x, y) => x.start_date.localeCompare(y.start_date));
    const start = isoWeekStart(new Date(sorted[0].start_date));
    const end = isoWeekStart(new Date(sorted[sorted.length - 1].start_date));
    const weeks = Math.max(
      1,
      Math.round((end.getTime() - start.getTime()) / (7 * 86400 * 1000)) + 1
    );
    const arr = new Array(weeks).fill(0);
    for (const r of rows) {
      const d = isoWeekStart(new Date(r.start_date));
      const idx = Math.round((d.getTime() - start.getTime()) / (7 * 86400 * 1000));
      arr[idx] += key === "count" ? 1 : (r[key] ?? 0);
    }
    return arr;
  };

  return {
    aTotal,
    bTotal,
    deltaPct,
    aWeekly: groupByWeekIdx(aRows),
    bWeekly: groupByWeekIdx(bRows),
  };
}

// ---------- Sport breakdown ----------

export interface SportSummary {
  sport_type: string;
  count: number;
  distance_m: number;
  moving_time_s: number;
  elevation_m: number;
  avg_hr: number | null;
  avg_speed_mps: number | null;
}

export function sportBreakdown(rows: ActivityRow[]): SportSummary[] {
  const map = new Map<string, SportSummary & { _hrSum: number; _hrN: number; _spdSum: number; _spdN: number }>();
  for (const r of rows) {
    const cur = map.get(r.sport_type) ?? {
      sport_type: r.sport_type,
      count: 0,
      distance_m: 0,
      moving_time_s: 0,
      elevation_m: 0,
      avg_hr: null,
      avg_speed_mps: null,
      _hrSum: 0,
      _hrN: 0,
      _spdSum: 0,
      _spdN: 0,
    };
    cur.count++;
    cur.distance_m += r.distance_m ?? 0;
    cur.moving_time_s += r.moving_time_s ?? 0;
    cur.elevation_m += r.total_elevation_gain_m ?? 0;
    if (r.average_heartrate != null) {
      cur._hrSum += r.average_heartrate;
      cur._hrN++;
    }
    if (r.average_speed_mps != null) {
      cur._spdSum += r.average_speed_mps;
      cur._spdN++;
    }
    map.set(r.sport_type, cur);
  }
  return Array.from(map.values())
    .map((s) => ({
      sport_type: s.sport_type,
      count: s.count,
      distance_m: s.distance_m,
      moving_time_s: s.moving_time_s,
      elevation_m: s.elevation_m,
      avg_hr: s._hrN > 0 ? s._hrSum / s._hrN : null,
      avg_speed_mps: s._spdN > 0 ? s._spdSum / s._spdN : null,
    }))
    .sort((a, b) => b.distance_m - a.distance_m);
}

// Pure helper functions for the Workouts > Training analytics page.
// No React, no DB access — operates on ActivityRow[] from /api/strava/activities.

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
  suffer_score: number | null;
  kudos_count: number;
  achievement_count: number;
  gear_id: string | null;
  polyline: string | null;
  start_lat: number | null;
  start_lng: number | null;
}

export type SportBucket = "swim" | "ride" | "run" | "other";

/** Map raw Strava sport_type to one of our four training buckets. */
export function mapSport(sportType: string | undefined | null): SportBucket {
  const t = (sportType || "").toLowerCase();
  if (t.includes("run")) return "run"; // Run, TrailRun, VirtualRun
  if (t.includes("ride") || t.includes("cycl") || t.includes("velomobile")) return "ride"; // Ride, VirtualRide, MountainBikeRide, GravelRide, EBikeRide
  if (t.includes("swim")) return "swim"; // Swim
  return "other";
}

export const SPORT_LABELS: Record<SportBucket, string> = {
  swim: "Swim",
  ride: "Ride",
  run: "Run",
  other: "Other",
};

// Muted per-sport palette consistent with the app's warm/sage theme.
export const SPORT_COLORS: Record<SportBucket, string> = {
  swim: "#6FA8C9", // muted blue
  ride: "#D4A24E", // muted amber
  run: "#7C9E8A", // sage (matches accent)
  other: "#A99A8C", // warm neutral
};

export function formatDuration(seconds: number): string {
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function formatDistance(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(meters >= 100000 ? 0 : 1)} km`;
  return `${Math.round(meters)} m`;
}

export function formatKm(meters: number, decimals = 1): string {
  return (meters / 1000).toFixed(decimals);
}

/** Pace as min:sec per km, e.g. "4:35 /km" — for runs. */
export function formatPace(speedMps: number | null | undefined): string | null {
  if (!speedMps || speedMps <= 0) return null;
  const secPerKm = 1000 / speedMps;
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, "0")} /km`;
}

/** Pace as min:sec per 100m — for swims. */
export function formatSwimPace(speedMps: number | null | undefined): string | null {
  if (!speedMps || speedMps <= 0) return null;
  const secPer100 = 100 / speedMps;
  const m = Math.floor(secPer100 / 60);
  const s = Math.round(secPer100 % 60);
  return `${m}:${String(s).padStart(2, "0")} /100m`;
}

/** Speed in km/h — for rides. */
export function formatSpeedKmh(speedMps: number | null | undefined): string | null {
  if (!speedMps || speedMps <= 0) return null;
  return `${(speedMps * 3.6).toFixed(1)} km/h`;
}

/** Generic pace/speed string based on the activity's sport bucket. */
export function formatPaceForSport(bucket: SportBucket, speedMps: number | null | undefined): string | null {
  if (bucket === "run") return formatPace(speedMps);
  if (bucket === "swim") return formatSwimPace(speedMps);
  if (bucket === "ride") return formatSpeedKmh(speedMps);
  return formatSpeedKmh(speedMps);
}

export function isoWeekStart(d: Date): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = x.getUTCDay() || 7; // Mon=1..Sun=7
  if (day !== 1) x.setUTCDate(x.getUTCDate() - (day - 1));
  return x;
}

export function isoWeekKey(d: Date): string {
  return isoWeekStart(d).toISOString().slice(0, 10);
}

export function activityDate(r: ActivityRow): Date {
  return new Date(r.start_date_local || r.start_date);
}

export interface SportTotals {
  count: number;
  distance_m: number;
  moving_time_s: number;
  elevation_m: number;
}

export type SportTotalsMap = Record<SportBucket, SportTotals>;

export function emptyTotals(): SportTotalsMap {
  return {
    swim: { count: 0, distance_m: 0, moving_time_s: 0, elevation_m: 0 },
    ride: { count: 0, distance_m: 0, moving_time_s: 0, elevation_m: 0 },
    run: { count: 0, distance_m: 0, moving_time_s: 0, elevation_m: 0 },
    other: { count: 0, distance_m: 0, moving_time_s: 0, elevation_m: 0 },
  };
}

/** Aggregate totals per sport bucket for a set of rows. */
export function totalsBySport(rows: ActivityRow[]): SportTotalsMap {
  const out = emptyTotals();
  for (const r of rows) {
    const b = mapSport(r.sport_type);
    out[b].count += 1;
    out[b].distance_m += r.distance_m || 0;
    out[b].moving_time_s += r.moving_time_s || 0;
    out[b].elevation_m += r.total_elevation_gain_m || 0;
  }
  return out;
}

export interface WeeklySportRow {
  weekStart: string; // YYYY-MM-DD (Monday)
  label: string; // e.g. "Jun 2"
  swim: number;
  ride: number;
  run: number;
  other: number;
}

/** Build last `weeks` weeks (oldest -> newest, including current week) of per-sport totals. */
export function weeklyTrend(
  rows: ActivityRow[],
  weeks: number,
  metric: "moving_time_s" | "distance_m"
): WeeklySportRow[] {
  const now = new Date();
  const currentWeekStart = isoWeekStart(now);

  const buckets = new Map<string, WeeklySportRow>();
  for (let i = weeks - 1; i >= 0; i--) {
    const ws = new Date(currentWeekStart);
    ws.setUTCDate(ws.getUTCDate() - i * 7);
    const key = ws.toISOString().slice(0, 10);
    buckets.set(key, {
      weekStart: key,
      label: ws.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      swim: 0,
      ride: 0,
      run: 0,
      other: 0,
    });
  }

  const earliest = Array.from(buckets.keys())[0];

  for (const r of rows) {
    const d = activityDate(r);
    const wk = isoWeekKey(d);
    if (wk < earliest) continue;
    const bucket = buckets.get(wk);
    if (!bucket) continue;
    const sport = mapSport(r.sport_type);
    const value = metric === "distance_m" ? (r.distance_m || 0) / 1000 : (r.moving_time_s || 0) / 3600;
    bucket[sport] += value;
  }

  return Array.from(buckets.values());
}

export interface RecordsResult {
  longestRun: { row: ActivityRow; distance_m: number } | null;
  longestRide: { row: ActivityRow; distance_m: number } | null;
  longestSwim: { row: ActivityRow; distance_m: number } | null;
  fastest5k: { row: ActivityRow; speed_mps: number } | null;
  biggestClimb: { row: ActivityRow; elevation_m: number } | null;
  longestWeek: { weekStart: string; distance_m: number } | null;
}

/** Compute simple "best effort" records from a list of activities. */
export function computeRecords(rows: ActivityRow[]): RecordsResult {
  let longestRun: RecordsResult["longestRun"] = null;
  let longestRide: RecordsResult["longestRide"] = null;
  let longestSwim: RecordsResult["longestSwim"] = null;
  let fastest5k: RecordsResult["fastest5k"] = null;
  let biggestClimb: RecordsResult["biggestClimb"] = null;

  const weekDistances = new Map<string, number>();

  for (const r of rows) {
    const bucket = mapSport(r.sport_type);
    const dist = r.distance_m || 0;

    if (bucket === "run" && (!longestRun || dist > longestRun.distance_m)) {
      longestRun = { row: r, distance_m: dist };
    }
    if (bucket === "ride" && (!longestRide || dist > longestRide.distance_m)) {
      longestRide = { row: r, distance_m: dist };
    }
    if (bucket === "swim" && (!longestSwim || dist > longestSwim.distance_m)) {
      longestSwim = { row: r, distance_m: dist };
    }

    if (bucket === "run" && dist >= 5000 && r.average_speed_mps) {
      if (!fastest5k || r.average_speed_mps > fastest5k.speed_mps) {
        fastest5k = { row: r, speed_mps: r.average_speed_mps };
      }
    }

    const elev = r.total_elevation_gain_m || 0;
    if (!biggestClimb || elev > biggestClimb.elevation_m) {
      biggestClimb = { row: r, elevation_m: elev };
    }

    const wk = isoWeekKey(activityDate(r));
    weekDistances.set(wk, (weekDistances.get(wk) || 0) + dist);
  }

  let longestWeek: RecordsResult["longestWeek"] = null;
  for (const [weekStart, distance_m] of weekDistances.entries()) {
    if (!longestWeek || distance_m > longestWeek.distance_m) {
      longestWeek = { weekStart, distance_m };
    }
  }

  return { longestRun, longestRide, longestSwim, fastest5k, biggestClimb, longestWeek };
}

import { NextResponse } from "next/server";
import { isStravaConfigured } from "@/lib/strava";
import { maybeSync } from "@/lib/strava-sync";
import { getActivitiesSince } from "@/lib/strava-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TZ = "Europe/Paris";

/** "YYYY-MM-DD" for `date` as observed in `tz`. */
function ymdInTz(date: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(date);
}

/** Start of the current ISO week (Monday, 00:00) in `tz`, returned as a UTC Date. */
function startOfWeekInTz(tz: string): Date {
  const now = new Date();
  // Weekday (1=Mon..7=Sun) as observed in tz.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  const dowMap: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  const dow = dowMap[map.weekday] ?? 1;
  // Midnight today (local civil date) expressed as UTC, then walk back to Monday.
  const todayUTC = Date.UTC(Number(map.year), Number(map.month) - 1, Number(map.day));
  return new Date(todayUTC - (dow - 1) * 24 * 60 * 60 * 1000);
}

export async function GET() {
  if (!isStravaConfigured()) {
    return NextResponse.json({ ok: false, reason: "not configured" });
  }

  await maybeSync();

  const weekStart = startOfWeekInTz(TZ);
  const rows = getActivitiesSince(weekStart.toISOString());

  let meters = 0;
  let seconds = 0;
  for (const a of rows) {
    meters += a.distance_m || 0;
    seconds += a.moving_time_s || 0;
  }

  const last = rows[0] ?? null;
  const today = ymdInTz(new Date(), TZ);
  const activeToday = !!(last && ymdInTz(new Date(last.start_date_local || last.start_date), TZ) === today);

  return NextResponse.json({
    ok: true,
    weekKm: +(meters / 1000).toFixed(1),
    weekMinutes: Math.round(seconds / 60),
    weekCount: rows.length,
    activeToday,
    last: last
      ? {
          name: last.name,
          type: last.sport_type,
          km: +((last.distance_m || 0) / 1000).toFixed(1),
          minutes: Math.round((last.moving_time_s || 0) / 60),
          date: last.start_date_local || last.start_date,
        }
      : null,
  });
}

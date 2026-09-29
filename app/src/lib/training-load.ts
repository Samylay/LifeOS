import { activityDate, type ActivityRow } from "@/components/training-stats";

export interface TrainingLoadPoint {
  date: string;
  load: number;
  ctl: number;
  atl: number;
  tsb: number;
}

const DAY_MS = 86_400_000;

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Load uses Strava relative effort (suffer_score) when present. Otherwise it
 * uses minutes × (average HR / activity max HR)², or half the minutes when HR
 * is absent. This is a rough within-athlete trend, not a calibrated TRIMP.
 * ponytail: keep this estimate bounded and simple until athlete max-HR data exists.
 */
export function activityLoad(activity: ActivityRow): number {
  if (activity.suffer_score != null && activity.suffer_score > 0) return activity.suffer_score;
  const minutes = Math.max(0, activity.moving_time_s) / 60;
  if (activity.average_heartrate && activity.max_heartrate && activity.max_heartrate > 0) {
    const intensity = Math.min(1, Math.max(0, activity.average_heartrate / activity.max_heartrate));
    return minutes * intensity ** 2;
  }
  return minutes * 0.5;
}

/** Daily EWMA history; CTL and ATL use periods of 42 and 7 days. */
export function trainingLoadHistory(
  activities: ActivityRow[],
  now: Date = new Date(),
  days = 90,
): TrainingLoadPoint[] {
  if (days <= 0) return [];
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const firstDay = today - (days - 1) * DAY_MS;
  const activityDays = new Map<string, number>();

  for (const activity of activities) {
    const date = activityDate(activity);
    if (!Number.isFinite(date.getTime())) continue;
    const day = isoDay(date);
    activityDays.set(day, (activityDays.get(day) ?? 0) + activityLoad(activity));
  }

  const alpha42 = 2 / 43;
  const alpha7 = 2 / 8;
  let ctl = 0;
  let atl = 0;
  const all: TrainingLoadPoint[] = [];
  for (let timestamp = firstDay - 365 * DAY_MS; timestamp <= today; timestamp += DAY_MS) {
    const date = new Date(timestamp);
    const day = isoDay(date);
    const load = activityDays.get(day) ?? 0;
    ctl += alpha42 * (load - ctl);
    atl += alpha7 * (load - atl);
    all.push({ date: day, load, ctl, atl, tsb: 0 });
  }

  for (let i = 0; i < all.length; i++) {
    all[i].tsb = i > 0 ? all[i - 1].ctl - all[i - 1].atl : 0;
  }
  return all.slice(-days);
}


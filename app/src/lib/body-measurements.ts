// Daily Garmin weigh-in + MFP-synced calories, persisted as history.
//
// /api/garmin/nutrition only ever shows "today" — there is no trend and no
// way to run the plan's adjustment rule (last 2 weigh-ins vs the 2 before).
// This writes one doc/day into bodyMeasurements, reusing the dormant
// BodyMeasurement type (weight field only). Idempotent per calendar date: the
// doc id IS the date string, so re-running a date overwrites rather than
// duplicates. Garmin returning null (no weigh-in / nothing logged in MFP that
// day) is a normal day, not an error — never write a zero for it.
import { fetchDailyNutrition, fetchWeight } from "@/lib/garmin-service";
import { getDoc, listDocs, setDoc } from "@/lib/server-db";

export const BODY_MEASUREMENTS_COLLECTION = "users/local/bodyMeasurements";

export interface BodyMeasurementDoc {
  date: string; // YYYY-MM-DD, also the doc id
  weightKg?: number;
  consumedKcal?: number;
}

function toDateString(date: Date): string {
  return date.toISOString().split("T")[0];
}

export interface SyncResult {
  date: string;
  written: boolean;
  reason?: string;
}

/** Sync one day's Garmin weigh-in + consumed kcal. Skips fields Garmin has no data for. */
export async function syncBodyMeasurementForDate(
  userId: string,
  date: Date = new Date()
): Promise<SyncResult> {
  const dateStr = toDateString(date);
  const [nutrition, weighIn] = await Promise.all([
    fetchDailyNutrition(userId, date),
    fetchWeight(userId, date),
  ]);

  const weightKg = weighIn?.weightKg ?? null;
  const consumedKcal = nutrition?.consumedKcal ?? null;
  if (weightKg == null && consumedKcal == null) {
    return { date: dateStr, written: false, reason: "no weigh-in or MFP log for this date" };
  }

  const existing = getDoc(BODY_MEASUREMENTS_COLLECTION, dateStr);
  const doc: Record<string, unknown> = { date: dateStr };
  if (weightKg != null) doc.weightKg = weightKg;
  else if (existing?.weightKg != null) doc.weightKg = existing.weightKg;
  if (consumedKcal != null) doc.consumedKcal = consumedKcal;
  else if (existing?.consumedKcal != null) doc.consumedKcal = existing.consumedKcal;

  setDoc(BODY_MEASUREMENTS_COLLECTION, dateStr, doc);
  return { date: dateStr, written: true };
}

/** Body measurements from the last `weeks` weeks, oldest first. */
export function listRecentBodyMeasurements(weeks = 8): BodyMeasurementDoc[] {
  const cutoff = Date.now() - weeks * 7 * 86_400_000;
  const docs = listDocs(BODY_MEASUREMENTS_COLLECTION, {
    orderBy: ["date", "asc"],
  }) as unknown as (BodyMeasurementDoc & { id: string })[];
  return docs
    .filter((d) => new Date(d.date).getTime() >= cutoff)
    .map(({ date, weightKg, consumedKcal }) => ({ date, weightKg, consumedKcal }));
}

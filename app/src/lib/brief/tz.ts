// Timezone helpers for the brief. The host clock is UTC; "today" for the brief
// must be Samy's wall clock (BRIEF_TZ), not the server's. The retired Python
// aggregator used server-local time, which made the 06:00-JST brief carry the
// previous UTC date — keep everything here TZ-aware to avoid that.

export const BRIEF_TZ = process.env.BRIEF_TZ || "Asia/Tokyo";

export interface TzToday {
  dateStr: string; // YYYY-MM-DD in tz
  weekdayIndex: number; // 0 = Monday … 6 = Sunday (matches the plan's mon..sun)
  dayOfYear: number;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function todayInTz(tz: string = BRIEF_TZ, now: Date = new Date()): TzToday {
  const dateStr = now.toLocaleDateString("en-CA", { timeZone: tz });
  const weekday = now.toLocaleDateString("en-US", { timeZone: tz, weekday: "short" });
  const [y, m, d] = dateStr.split("-").map(Number);
  const startOfYear = Date.UTC(y, 0, 1);
  const dayOfYear = Math.floor((Date.UTC(y, m - 1, d) - startOfYear) / 86_400_000) + 1;
  return { dateStr, weekdayIndex: WEEKDAYS.indexOf(weekday), dayOfYear };
}

export function weekdayLabelInTz(tz: string = BRIEF_TZ, now: Date = new Date()): string {
  return now.toLocaleDateString("en-US", { timeZone: tz, weekday: "long" });
}

/** UTC offset of `tz` at `date`, in ms. */
function tzOffsetMs(tz: string, date: Date): number {
  const wall = new Date(date.toLocaleString("sv-SE", { timeZone: tz }).replace(" ", "T") + "Z");
  return wall.getTime() - date.getTime();
}

/** Ms from `now` until the next `hour`:00 wall-clock in `tz` (DST-safe enough: offset recomputed per target day). */
export function msUntilNextRun(hour: number, tz: string = BRIEF_TZ, now: Date = new Date()): number {
  for (let addDays = 0; addDays <= 2; addDays++) {
    const dateStr = new Date(now.getTime() + addDays * 86_400_000).toLocaleDateString("en-CA", {
      timeZone: tz,
    });
    const [y, m, d] = dateStr.split("-").map(Number);
    const naive = Date.UTC(y, m - 1, d, hour, 0, 0);
    const target = naive - tzOffsetMs(tz, new Date(naive));
    if (target > now.getTime()) return target - now.getTime();
  }
  return 86_400_000; // unreachable fallback
}

/** True if `tz` wall clock is already past `hour`:00 today. */
export function isPastHourInTz(hour: number, tz: string = BRIEF_TZ, now: Date = new Date()): boolean {
  const h = Number(
    now.toLocaleTimeString("en-GB", { timeZone: tz, hour12: false, hour: "2-digit" })
  );
  return h >= hour;
}

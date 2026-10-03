// Money runs on the pay cycle, not the calendar month: it starts on the day the salary usually
// lands (the 27th) and ends the day before the next one. Dates are YYYY-MM-DD strings in UTC.
import type { FinanceActivity } from "./finance-activity";

export const PAY_DAY = 27;

export interface DateRange { start: string; end: string }
export interface PayCycle extends DateRange {
  /** First day of the next cycle. */
  nextStart: string;
  /** Length of the cycle in days. */
  days: number;
  /** Which day of the cycle `today` is (1 on the pay day). */
  day: number;
  /** The previous cycle, whole. */
  previous: DateRange;
  /** The previous cycle cut at the same day number as `today`, for like-for-like comparison. */
  previousThroughSameDay: DateRange;
}

const DAY_MS = 86_400_000;
const parse = (date: string) => Date.parse(`${date}T00:00:00Z`);
const format = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const addDays = (date: string, n: number) => format(parse(date) + n * DAY_MS);
const monthDay = (year: number, month0: number, day: number) => format(Date.UTC(year, month0, day));

export function payCycle(today: string, payDay = PAY_DAY): PayCycle {
  const [y, m, d] = today.split("-").map(Number);
  const thisMonthStart = monthDay(y, m - 1, payDay);
  const start = d >= payDay ? thisMonthStart : monthDay(y, m - 2, payDay);
  const nextStart = d >= payDay ? monthDay(y, m, payDay) : thisMonthStart;
  const previousStart = d >= payDay ? monthDay(y, m - 2, payDay) : monthDay(y, m - 3, payDay);
  const day = Math.round((parse(today) - parse(start)) / DAY_MS) + 1;
  return {
    start, end: addDays(nextStart, -1), nextStart,
    days: Math.round((parse(nextStart) - parse(start)) / DAY_MS),
    day,
    previous: { start: previousStart, end: addDays(start, -1) },
    previousThroughSameDay: { start: previousStart, end: addDays(previousStart, day - 1) },
  };
}

export const inRange = (date: string | null, range: DateRange) => date !== null && date >= range.start && date <= range.end;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "27 Sep – 26 Oct". Fixed abbreviations, so the label does not change with the system locale. */
export function cycleLabel(range: DateRange): string {
  const fmt = (date: string) => `${Number(date.slice(8, 10))} ${MONTHS[Number(date.slice(5, 7)) - 1]}`;
  return `${fmt(range.start)} – ${fmt(range.end)}`;
}

const counts = (item: FinanceActivity) => item.currency === "EUR" && item.included && !item.isTransfer && item.date !== null;

/** Money in and out inside a range, with the same inclusion rules as the spending totals. */
export function totalsInRange(activity: FinanceActivity[], range: DateRange): { in: number; out: number } {
  let income = 0;
  let spent = 0;
  for (const item of activity) {
    if (!counts(item) || !inRange(item.date, range)) continue;
    if (item.direction === "in") income += item.amount;
    else if (item.direction === "out") spent += item.amount;
  }
  return { in: Math.round(income * 100) / 100, out: Math.round(spent * 100) / 100 };
}

/** Spending per category inside a range. */
export function categoryTotalsInRange(activity: FinanceActivity[], range: DateRange): Map<string, number> {
  const totals = new Map<string, number>();
  for (const item of activity) {
    if (!counts(item) || item.direction !== "out" || !inRange(item.date, range)) continue;
    totals.set(item.category, (totals.get(item.category) ?? 0) + item.amount);
  }
  return totals;
}

/** Cumulative spending by day number within a cycle (day 1 is the first day). */
export function cumulativeSpend(activity: FinanceActivity[], range: DateRange, throughDay: number): number[] {
  const byDay = new Array<number>(throughDay).fill(0);
  for (const item of activity) {
    if (!counts(item) || item.direction !== "out" || !inRange(item.date, range)) continue;
    const index = Math.round((parse(item.date!) - parse(range.start)) / DAY_MS);
    if (index >= 0 && index < throughDay) byDay[index] += item.amount;
  }
  let running = 0;
  return byDay.map((value) => (running += value));
}

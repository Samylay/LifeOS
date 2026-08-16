// Per-day counter for the plan's 4 daily eating blocks. Manual tap counter,
// not a food log — food stays in MyFitnessPal. Doc id is the date string, so
// a re-tap on the same day just overwrites the count.
import { getDoc, setDoc } from "@/lib/server-db";
import { BLOCKS_PER_DAY } from "@/lib/nutrition-constants";

export const DAILY_BLOCKS_COLLECTION = "users/local/dailyBlocks";
export { BLOCKS_PER_DAY };

export interface DailyBlocksDoc {
  date: string;
  blocksCompleted: number;
}

function toDateString(date: Date): string {
  return date.toISOString().split("T")[0];
}

export function getDailyBlocks(date: Date = new Date()): DailyBlocksDoc {
  const dateStr = toDateString(date);
  const doc = getDoc(DAILY_BLOCKS_COLLECTION, dateStr);
  const blocksCompleted =
    typeof doc?.blocksCompleted === "number" ? doc.blocksCompleted : 0;
  return { date: dateStr, blocksCompleted: clamp(blocksCompleted) };
}

function clamp(n: number): number {
  return Math.max(0, Math.min(BLOCKS_PER_DAY, Math.round(n)));
}

export function setDailyBlocks(blocksCompleted: number, date: Date = new Date()): DailyBlocksDoc {
  const dateStr = toDateString(date);
  const doc: DailyBlocksDoc = { date: dateStr, blocksCompleted: clamp(blocksCompleted) };
  setDoc(DAILY_BLOCKS_COLLECTION, dateStr, { ...doc });
  return doc;
}

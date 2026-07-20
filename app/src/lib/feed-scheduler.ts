// Nightly feed-card generation, mirroring the news scheduler: run at
// RUN_HOUR in BRIEF_TZ with catch-up on boot. 03:00 sits between news (04:00)
// and nothing — the feed just needs cards before Samy wakes up. Guarded so a
// restart inside the same day doesn't regenerate (cards created in the last
// 20h ⇒ the night already ran; the fresh-buffer caps bound the damage anyway).
import { runFeedGeneration } from "./feed-generator";
import { dateMarker, markerMs } from "./feed";
import { getDoc, updateDoc } from "./server-db";
import { BRIEF_TZ, isPastHourInTz, msUntilNextRun } from "@/lib/brief/tz";

const RUN_HOUR = 3;
const ALREADY_RAN_WINDOW_MS = 20 * 60 * 60 * 1000;
// Run stamp, written at run START — a zero-insert night (judge rejected all,
// everything deduped) must still count as "ran" or every boot re-spends the
// full 2-LLM-calls-per-topic pipeline.
const META = "users/local/feedMeta";
const STAMP_ID = "scheduler";

declare global {
  var __feedSchedulerStarted: boolean | undefined;
}

function log(msg: string) {
  console.log(`[feed-scheduler] ${new Date().toISOString()} ${msg}`);
}

function ranRecently(): boolean {
  const stamp = getDoc(META, STAMP_ID) as Record<string, unknown> | null;
  const last = markerMs(stamp?.lastRunAt) ?? 0;
  return last >= Date.now() - ALREADY_RAN_WINDOW_MS;
}

async function runSafely(trigger: string) {
  // Guard ALL scheduler triggers, not just catch-up: a 23:xx boot would
  // otherwise catch-up and then run again at 03:00 — double LLM spend.
  // (The manual /api/feed/generate trigger bypasses this by design.)
  if (ranRecently()) {
    log(`${trigger} skipped: generation already ran in the last 20h`);
    return;
  }
  updateDoc(META, STAMP_ID, { lastRunAt: dateMarker() });
  try {
    const res = await runFeedGeneration();
    log(`${trigger} run done: ${res.inserted} card(s) across ${res.topics} topic(s)` +
      (res.skipped.length ? `; skipped: ${res.skipped.join(", ")}` : ""));
  } catch (e) {
    log(`${trigger} run crashed: ${e instanceof Error ? e.message : e}`);
  }
}

function scheduleNext() {
  const delay = msUntilNextRun(RUN_HOUR);
  log(`next run in ${Math.round(delay / 60_000)} min (${RUN_HOUR}:00 ${BRIEF_TZ})`);
  const t = setTimeout(async () => {
    await runSafely("scheduled");
    scheduleNext();
  }, delay);
  t.unref();
}

export function startFeedScheduler() {
  if (globalThis.__feedSchedulerStarted) return;
  globalThis.__feedSchedulerStarted = true;

  if (isPastHourInTz(RUN_HOUR)) void runSafely("catch-up");
  scheduleNext();
}

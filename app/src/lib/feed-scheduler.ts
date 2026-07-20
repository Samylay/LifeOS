// Nightly feed-card generation, mirroring the news scheduler: run at
// RUN_HOUR in BRIEF_TZ with catch-up on boot. 03:00 sits between news (04:00)
// and nothing — the feed just needs cards before Samy wakes up. Guarded so a
// restart inside the same day doesn't regenerate (cards created in the last
// 20h ⇒ the night already ran; the fresh-buffer caps bound the damage anyway).
import { runFeedGeneration } from "./feed-generator";
import { listCards } from "./feed";
import { markerMs } from "./feed";
import { BRIEF_TZ, isPastHourInTz, msUntilNextRun } from "@/lib/brief/tz";

const RUN_HOUR = 3;
const ALREADY_RAN_WINDOW_MS = 20 * 60 * 60 * 1000;

declare global {
  var __feedSchedulerStarted: boolean | undefined;
}

function log(msg: string) {
  console.log(`[feed-scheduler] ${new Date().toISOString()} ${msg}`);
}

function ranRecently(): boolean {
  const cutoff = Date.now() - ALREADY_RAN_WINDOW_MS;
  return listCards().some((c) => (markerMs(c.createdAt) ?? 0) >= cutoff);
}

async function runSafely(trigger: string) {
  if (trigger === "catch-up" && ranRecently()) {
    log("catch-up skipped: cards already generated in the last 20h");
    return;
  }
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

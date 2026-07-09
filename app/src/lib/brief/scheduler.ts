// In-app replacement for the host's brief.timer: daily at 06:00 BRIEF_TZ,
// with catch-up on boot (Persistent=true equivalent) — if the app was down at
// 06:00, the register()-time check runs the missed brief instead of skipping
// the day. runBrief() itself dedupes by date, so restarts never double-send.

import { runBrief } from "./builder";
import { BRIEF_TZ, isPastHourInTz, msUntilNextRun } from "./tz";

const RUN_HOUR = 6;

declare global {
  // Survives HMR in dev; one scheduler per process in prod.
  var __briefSchedulerStarted: boolean | undefined;
}

function log(msg: string) {
  console.log(`[brief-scheduler] ${new Date().toISOString()} ${msg}`);
}

async function runSafely(trigger: string) {
  try {
    const result = await runBrief();
    log(result.ran ? `${trigger} run done` : `${trigger} run skipped: ${result.reason}`);
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
  t.unref(); // never keep the process alive just for the timer
}

export function startBriefScheduler() {
  if (globalThis.__briefSchedulerStarted) return;
  globalThis.__briefSchedulerStarted = true;

  // Catch-up: past 06:00 and no brief for today yet → run now (runBrief dedupes).
  if (isPastHourInTz(RUN_HOUR)) {
    void runSafely("catch-up");
  }
  scheduleNext();
}

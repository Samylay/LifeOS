// In-app replacement for the host's brief.timer: daily at 06:15 BRIEF_TZ,
// with catch-up on boot (Persistent=true equivalent) — if the app was down at
// 06:15, the register()-time check runs the missed brief instead of skipping
// the day. runBrief() itself dedupes by date, so restarts never double-send.
//
// today-brief-rework ticket 03: the brief is built for the moment it is
// delivered. Delivery is a fixed 06:30 Europe/Paris (Samy, 2026-09-06); this
// generates 15 minutes ahead of that so the contents are current when the
// push notification (separate delivery path) reaches him. The hour+minute
// is a single named value here, not a settings screen — that comes later.

import { runBrief } from "./builder";
import { BRIEF_TZ, isPastHourInTz, msUntilNextRun } from "./tz";

const RUN_HOUR = 6;
const RUN_MINUTE = 15;

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
  const delay = msUntilNextRun(RUN_HOUR, BRIEF_TZ, new Date(), RUN_MINUTE);
  const label = `${String(RUN_HOUR).padStart(2, "0")}:${String(RUN_MINUTE).padStart(2, "0")}`;
  log(`next run in ${Math.round(delay / 60_000)} min (${label} ${BRIEF_TZ})`);
  const t = setTimeout(async () => {
    await runSafely("scheduled");
    scheduleNext();
  }, delay);
  t.unref(); // never keep the process alive just for the timer
}

export function startBriefScheduler() {
  if (globalThis.__briefSchedulerStarted) return;
  globalThis.__briefSchedulerStarted = true;

  // Catch-up: past 06:15 and no brief for today yet → run now (runBrief
  // dedupes by date, so this never double-builds on top of an already-fresh
  // brief; it only fires when today's brief is missing).
  if (isPastHourInTz(RUN_HOUR, BRIEF_TZ, new Date(), RUN_MINUTE)) {
    void runSafely("catch-up");
  }
  scheduleNext();
}

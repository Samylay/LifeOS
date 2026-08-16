// Daily body-measurements sync, mirroring ships-vault-scheduler: run at
// RUN_HOUR in BRIEF_TZ with catch-up on boot. 22:00 sits after both the
// day's Garmin weigh-in and MyFitnessPal logging are normally done, so the
// day being synced is complete when the job fires.
import { syncBodyMeasurementForDate } from "./body-measurements";
import { BRIEF_TZ, isPastHourInTz, msUntilNextRun } from "@/lib/brief/tz";

const RUN_HOUR = 22;
const GARMIN_UID = "local";

declare global {
  var __bodyMeasurementsSchedulerStarted: boolean | undefined;
}

function log(msg: string) {
  console.log(`[body-measurements-scheduler] ${new Date().toISOString()} ${msg}`);
}

async function runSafely(trigger: string) {
  try {
    const r = await syncBodyMeasurementForDate(GARMIN_UID);
    log(`${trigger} run: ${r.written ? `wrote ${r.date}` : `skipped ${r.date} — ${r.reason}`}`);
  } catch (e) {
    log(`${trigger} run crashed: ${e instanceof Error ? e.message : e}`);
  }
}

function scheduleNext() {
  const delay = msUntilNextRun(RUN_HOUR);
  log(`next run in ${Math.round(delay / 60_000)} min (${RUN_HOUR}:00 ${BRIEF_TZ})`);
  const t = setTimeout(() => {
    void runSafely("scheduled");
    scheduleNext();
  }, delay);
  t.unref();
}

export function startBodyMeasurementsScheduler() {
  if (globalThis.__bodyMeasurementsSchedulerStarted) return;
  globalThis.__bodyMeasurementsSchedulerStarted = true;

  if (isPastHourInTz(RUN_HOUR)) void runSafely("catch-up");
  scheduleNext();
}

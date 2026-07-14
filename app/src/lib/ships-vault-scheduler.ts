// Daily ships→vault sweep, mirroring the news scheduler: run at RUN_HOUR in
// BRIEF_TZ with catch-up on boot. syncShipsToVault() is write-once per day,
// so restarts and the catch-up path never duplicate a note.
import { syncShipsToVault } from "./ships-vault";
import { BRIEF_TZ, isPastHourInTz, msUntilNextRun } from "@/lib/brief/tz";

const RUN_HOUR = 5;

declare global {
  var __shipsVaultSchedulerStarted: boolean | undefined;
}

function log(msg: string) {
  console.log(`[ships-vault-scheduler] ${new Date().toISOString()} ${msg}`);
}

function runSafely(trigger: string) {
  try {
    const r = syncShipsToVault();
    log(`${trigger} run: ${r.written ? `wrote ${r.path} (${r.count} ship${r.count === 1 ? "" : "s"})` : `skipped ${r.day} — ${r.reason}`}`);
  } catch (e) {
    log(`${trigger} run crashed: ${e instanceof Error ? e.message : e}`);
  }
}

function scheduleNext() {
  const delay = msUntilNextRun(RUN_HOUR);
  log(`next run in ${Math.round(delay / 60_000)} min (${RUN_HOUR}:00 ${BRIEF_TZ})`);
  const t = setTimeout(() => {
    runSafely("scheduled");
    scheduleNext();
  }, delay);
  t.unref();
}

export function startShipsVaultScheduler() {
  if (globalThis.__shipsVaultSchedulerStarted) return;
  globalThis.__shipsVaultSchedulerStarted = true;

  if (isPastHourInTz(RUN_HOUR)) runSafely("catch-up");
  scheduleNext();
}

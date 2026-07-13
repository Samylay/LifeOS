// Daily news generation, mirroring the brief scheduler: run at NEWS_HOUR in
// BRIEF_TZ with catch-up on boot. runNews() dedupes by date, so restarts and
// the catch-up path never regenerate an existing edition. Kept a couple of
// hours before the 06:00 brief so today's edition is ready when the brief
// card reads it.
import { runNews } from "./engine";
import { BRIEF_TZ, isPastHourInTz, msUntilNextRun } from "@/lib/brief/tz";

const RUN_HOUR = 4;

declare global {
  var __newsSchedulerStarted: boolean | undefined;
}

function log(msg: string) {
  console.log(`[news-scheduler] ${new Date().toISOString()} ${msg}`);
}

async function runSafely(trigger: string) {
  try {
    const edition = await runNews();
    log(`${trigger} run done: ${edition.items.length} item(s) for ${edition.date}`);
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

export function startNewsScheduler() {
  if (globalThis.__newsSchedulerStarted) return;
  globalThis.__newsSchedulerStarted = true;

  if (isPastHourInTz(RUN_HOUR)) void runSafely("catch-up");
  scheduleNext();
}

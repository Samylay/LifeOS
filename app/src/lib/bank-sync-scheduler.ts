import { getBankSyncState, listBankAccounts } from "./bank-db";
import { isEnableBankingConfigured } from "./enable-banking";
import { requestBankSync } from "./bank-sync";
import { nextBankSyncAt } from "./bank-sync-schedule";

declare global { var __bankSyncSchedulerStarted: boolean | undefined; }

export async function syncBankIfDue(now = Date.now()) {
  if (!isEnableBankingConfigured() || !listBankAccounts().length) return;
  const next = nextBankSyncAt(Number(getBankSyncState("last_sync_attempt_at")), Number(getBankSyncState("last_sync_at")), now);
  if (next > now) return;
  await requestBankSync();
}

export function startBankSyncScheduler() {
  if (globalThis.__bankSyncSchedulerStarted) return;
  globalThis.__bankSyncSchedulerStarted = true;
  const tick = () => void syncBankIfDue().catch(() => console.error("[bank-sync] Scheduled refresh failed."));
  // Catch up shortly after boot; check the persisted schedule once a minute.
  setTimeout(() => {
    tick();
    setInterval(tick, 60_000).unref();
  }, 15_000).unref();
  console.log("[bank-sync] Five-hour automatic sync enabled.");
}

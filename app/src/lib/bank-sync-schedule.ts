export const BANK_SYNC_INTERVAL_MS = 5 * 60 * 60 * 1000;

/** Attempts survive process restarts. A failed bank is retried next interval. */
export function nextBankSyncAt(lastAttempt: number | null, lastSuccess: number | null, now: number): number {
  const valid = [lastAttempt, lastSuccess].filter((value): value is number => value !== null && Number.isFinite(value) && value > 0 && value <= now);
  return valid.length ? Math.max(...valid) + BANK_SYNC_INTERVAL_MS : now;
}

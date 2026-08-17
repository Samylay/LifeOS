// Server-only half of the consent-expiry tripwire (ROADMAP T72). Split out
// of bank-consent-tripwire.ts so that file can stay pure/client-safe (see
// its doc comment) — this one imports bank-db (better-sqlite3) and is only
// ever called from bank-sync.ts, which runs server-side.
import { getBankSyncState, setBankSyncState, type BankSessionRow } from "./bank-db";
import { findExpiringConsents, buildTripwireMessage, type ExpiringConsent } from "./bank-consent-tripwire";

const NOTIFIED_KEY_PREFIX = "consent_notified:";
const PAGER_URL = "http://127.0.0.1:3000/api/notify";

function alreadyNotifiedToday(sessionId: string, now: string): boolean {
  const last = getBankSyncState(`${NOTIFIED_KEY_PREFIX}${sessionId}`);
  return Boolean(last) && last!.slice(0, 10) === now.slice(0, 10);
}

/**
 * POSTs one pager message. Best-effort: swallows every failure (network,
 * non-2xx, timeout) so a pager outage can never block or roll back a sync.
 * Injectable transport for tests, matching the pattern already used for the
 * Enable Banking client (enable-banking.ts) and bank-sync.ts.
 */
export async function postPagerNotification(
  message: ReturnType<typeof buildTripwireMessage>,
  transport: typeof fetch = fetch
): Promise<void> {
  try {
    await transport(PAGER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...message, severity: "high" }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // Best-effort — see doc comment.
  }
}

/**
 * Finds sessions whose consent is expiring within the warning window and
 * pages once per session per calendar day (notify-gateway's own dedupe
 * window is only 10 minutes, which isn't enough here — bank-sync is
 * manual-trigger-only, per T69, so Samy re-running it later the same day
 * must not re-page him for the same expiry).
 */
export async function checkAndNotifyConsentExpiry(
  sessions: BankSessionRow[],
  transport: typeof fetch = fetch,
  now: string = new Date().toISOString()
): Promise<ExpiringConsent[]> {
  const expiring = findExpiringConsents(sessions, now);
  for (const entry of expiring) {
    if (alreadyNotifiedToday(entry.session.sessionId, now)) continue;
    await postPagerNotification(buildTripwireMessage(entry), transport);
    setBankSyncState(`${NOTIFIED_KEY_PREFIX}${entry.session.sessionId}`, now);
  }
  return expiring;
}

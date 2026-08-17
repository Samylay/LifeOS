// Consent-expiry tripwire (ROADMAP T72) — the failure this pipeline is
// *designed* to have (MAP's "re-consent cycle" note). Enable Banking
// sessions run up to 180 days (EEA cycle); Samy has to physically re-approve
// at his bank when one lapses, so the alert has to fire *before* the data
// goes silently stale, not be discovered after.
//
// Pure logic only, deliberately: `isConsentExpired` is imported from the
// client-side /finance panel (ConnectedAccountsPanel) to render the "stale"
// badge, so this file must never import bank-db (better-sqlite3 pulls in
// native `fs`/`bindings` modules that break the client bundle — that's why
// BankSessionRow is a type-only import). The side-effecting half (reading
// live sessions, calling the pager, marking "already notified today") lives
// server-side in bank-consent-notify.ts.
import type { BankSessionRow } from "./bank-db";

export const CONSENT_EXPIRY_WARNING_DAYS = 10;

export interface ExpiringConsent {
  session: BankSessionRow;
  /** May be negative — the session already expired. */
  daysRemaining: number;
}

function daysBetween(fromIso: string, toIso: string): number {
  return (Date.parse(toIso) - Date.parse(fromIso)) / 86_400_000;
}

/**
 * Sessions with < `warningDays` of consent left, sorted soonest-first.
 * Sessions with no recorded `validUntil` are skipped — Enable Banking's
 * response for that session's expiry was never captured, and warning about
 * an unknown date would be a guess, not a tripwire.
 */
export function findExpiringConsents(
  sessions: BankSessionRow[],
  now: string = new Date().toISOString(),
  warningDays: number = CONSENT_EXPIRY_WARNING_DAYS
): ExpiringConsent[] {
  return sessions
    .filter((s): s is BankSessionRow & { validUntil: string } => Boolean(s.validUntil))
    .map((s) => ({ session: s, daysRemaining: daysBetween(now, s.validUntil) }))
    .filter((e) => e.daysRemaining < warningDays)
    .sort((a, b) => a.daysRemaining - b.daysRemaining);
}

/** Has this session's consent actually lapsed (not just approaching)? */
export function isConsentExpired(validUntil: string | null, now: string = new Date().toISOString()): boolean {
  if (!validUntil) return false;
  return Date.parse(validUntil) < Date.parse(now);
}

export interface TripwireMessage {
  title: string;
  text: string;
  path: string;
  source: string;
}

export function buildTripwireMessage(entry: ExpiringConsent): TripwireMessage {
  const bank = entry.session.aspspName ?? "a linked bank";
  const days = Math.ceil(entry.daysRemaining);
  const status = days <= 0 ? "has expired" : `expires in ${days} day${days === 1 ? "" : "s"}`;
  return {
    title: "Bank consent expiring",
    text: `${bank} consent ${status}. Re-connect it on /finance to keep the sync fresh.`,
    path: "/finance",
    source: "finance-consent-tripwire",
  };
}

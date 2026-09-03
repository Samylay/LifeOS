// T-decide-rework-06 — what the /decide deck is allowed to show, as a pure
// rule so "when does a deferred card come back" is answerable without running
// the app.
//
// Deferring is an explicit verdict, not abandonment: the item leaves the
// current session and returns on a defined date. Nothing disappears.

export const DEFER_DAYS = 7;

export interface QueueDoc {
  status?: string;
  deferUntil?: { __date?: string } | string;
  createdAt?: { __date?: string } | string;
}

function toTime(v: QueueDoc["deferUntil"]): number | null {
  const iso = typeof v === "string" ? v : v?.__date;
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
}

export function deferUntilFrom(now: Date, days = DEFER_DAYS): string {
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

// A deferred item with no readable deferUntil is shown rather than hidden —
// losing a card to a malformed date would be the failure mode this rule
// exists to prevent.
export function isDue(doc: QueueDoc, now: Date): boolean {
  if (doc.status === "proposed") return true;
  if (doc.status !== "deferred") return false;
  const until = toTime(doc.deferUntil);
  return until === null || until <= now.getTime();
}

export function visibleQueueItems<T extends QueueDoc>(items: T[], now: Date): T[] {
  return items
    .filter((i) => isDue(i, now))
    .sort((a, b) => (toTime(a.createdAt) ?? 0) - (toTime(b.createdAt) ?? 0));
}

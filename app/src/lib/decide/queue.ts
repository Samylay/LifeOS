// T-decide-rework-06 — what the /decide deck is allowed to show, as a pure
// rule so "when does a deferred card come back" is answerable without running
// the app.
//
// Deferring is an explicit verdict, not abandonment: the item leaves the
// current session and returns on a defined date. Nothing disappears.

export const DEFER_DAYS = 7;

// How far back the dispatch surface looks for items to hand to Claude. The
// window is the point: an "approved items" list with no bound is the holding
// pen this rework exists to kill (45 items sat filed and untouched). Filing is
// the action now — anything older than this is finished, not pending.
export const DISPATCH_WINDOW_DAYS = 7;

export interface QueueDoc {
  status?: string;
  deferUntil?: { __date?: string } | string;
  createdAt?: { __date?: string } | string;
  filedAt?: { __date?: string } | string;
}

function toTime(v: QueueDoc["deferUntil"] | undefined): number | null {
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

// Items filed inside the dispatch window and not already queued for Claude —
// newest first, because the thing you just decided is the thing you want to
// hand over. An item with no readable filedAt is excluded: it is old enough
// to predate the field, so it is finished, not pending.
export function dispatchableItems<T extends QueueDoc & { id: string }>(
  items: T[],
  queuedItemIds: Iterable<string>,
  now: Date,
  days = DISPATCH_WINDOW_DAYS,
): T[] {
  const queued = new Set(queuedItemIds);
  const cutoff = now.getTime() - days * 24 * 60 * 60 * 1000;
  return items
    .filter((i) => {
      if (i.status !== "filed" || queued.has(i.id)) return false;
      const filed = toTime(i.filedAt);
      return filed !== null && filed >= cutoff;
    })
    .sort((a, b) => (toTime(b.filedAt) ?? 0) - (toTime(a.filedAt) ?? 0));
}

// A verdict is allowed while the item is still open. Deferred counts: a
// deferred card comes back to the deck, and a card you can see but cannot act
// on is worse than one that never returned.
export function isOpenForVerdict(status: string | undefined): boolean {
  return status === "proposed" || status === "deferred";
}

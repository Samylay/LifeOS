export const SAVED_LIMIT = 10;
export const SAVED_MAX_AGE_DAYS = 14;

export interface SavedInboxItem {
  id: string;
  savedAt?: { __date?: string } | string;
  createdAt?: { __date?: string } | string;
}

function timestamp(item: SavedInboxItem): number | null {
  const value = item.savedAt ?? item.createdAt;
  const iso = typeof value === "string" ? value : value?.__date;
  if (!iso) return null;
  const time = Date.parse(iso);
  return Number.isFinite(time) ? time : null;
}

/** Display-only expiry and daily deck cap. Missing or malformed dates stay visible. */
export function capSavedItems<T extends SavedInboxItem>(items: T[], now = new Date()) {
  const cutoff = now.getTime() - SAVED_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  const fresh = items.filter((item) => {
    const time = timestamp(item);
    return time === null || time >= cutoff;
  });
  const visible = fresh.slice(0, SAVED_LIMIT);
  return { visible, capped: fresh.length - visible.length, expired: items.length - fresh.length };
}

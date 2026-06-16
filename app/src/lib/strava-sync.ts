// Pulls activities from the Strava API into the local SQLite store.
import { strava, isStravaConfigured } from "./strava";
import {
  upsertActivities,
  getMaxStartDate,
  countActivities,
  setSyncState,
  getSyncState,
  type StravaActivitySummary,
} from "./strava-db";

const PER_PAGE = 100;
const MAX_PAGES_PER_CALL = 10;
const OVERLAP_DAYS = 7;

export interface SyncResult {
  ok: boolean;
  added: number;
  total: number;
  reason?: string;
}

/**
 * Incremental sync: starts from max(start_date) - 7 days overlap. If the
 * table is empty, paginates from the beginning (full backfill), capped at
 * MAX_PAGES_PER_CALL pages per invocation to respect rate limits.
 */
export async function syncActivities(opts: { full?: boolean } = {}): Promise<SyncResult> {
  if (!isStravaConfigured()) {
    return { ok: false, added: 0, total: countActivities(), reason: "not configured" };
  }

  let after: number | undefined;
  if (!opts.full) {
    const maxStart = getMaxStartDate();
    if (maxStart) {
      const ts = Date.parse(maxStart);
      if (!Number.isNaN(ts)) {
        after = Math.floor(ts / 1000) - OVERLAP_DAYS * 24 * 60 * 60;
      }
    }
  }

  let added = 0;
  let page = 1;
  try {
    while (page <= MAX_PAGES_PER_CALL) {
      const batch = await strava<StravaActivitySummary[]>("/athlete/activities", {
        after,
        page,
        per_page: PER_PAGE,
      });
      if (!batch) {
        if (added === 0) {
          return { ok: false, added: 0, total: countActivities(), reason: "strava request failed" };
        }
        break;
      }
      if (batch.length === 0) break;
      added += upsertActivities(batch);
      if (batch.length < PER_PAGE) break;
      page++;
    }
    setSyncState("last_sync_at", String(Date.now()));
    return { ok: true, added, total: countActivities() };
  } catch (e) {
    return {
      ok: false,
      added,
      total: countActivities(),
      reason: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * Runs an incremental sync at most once every `minIntervalMs` (default 15
 * minutes), tracked via strava_sync_state. Used by the summary endpoint as a
 * lightweight "keep the local cache fresh" guard.
 */
export async function maybeSync(minIntervalMs = 15 * 60 * 1000): Promise<void> {
  if (!isStravaConfigured()) return;
  const last = Number(getSyncState("last_sync_attempt_at") ?? "0");
  if (Date.now() - last < minIntervalMs) return;
  setSyncState("last_sync_attempt_at", String(Date.now()));
  try {
    await syncActivities();
  } catch {
    // best-effort; ignore failures here
  }
}

// T-projects-rework-02 — serving derived state without making Samy wait.
//
// Scanning thirteen repos on every request is the obvious way to make this
// surface slow, so a request never triggers a scan it has to wait for. It
// takes whatever the last scan produced and says when that was; a refresh
// runs in the background when the data has aged past FRESH_MS.
//
// A number twenty minutes old that says so is honest. One that pretends to be
// live is not, which is the failure this whole rework exists to fix.

export const FRESH_MS = 10 * 60 * 1000;

export interface Snapshot<T> {
  computedAt: string | null;
  projects: T[];
  // No scan has finished yet — distinct from "scanned and found nothing".
  computing: boolean;
  stale: boolean;
}

export function isStale(computedAt: string | null, now: Date, freshMs = FRESH_MS): boolean {
  if (!computedAt) return true;
  const t = new Date(computedAt).getTime();
  // An unreadable stamp is treated as stale rather than trusted: the wrong
  // way to fail here is to serve old data as current.
  if (Number.isNaN(t)) return true;
  return now.getTime() - t > freshMs;
}

// A tiny generic cache so the scan itself stays testable in isolation.
export class SnapshotCache<T> {
  private computedAt: string | null = null;
  private projects: T[] = [];
  private refreshing = false;

  constructor(
    private readonly compute: () => T[],
    private readonly freshMs = FRESH_MS,
  ) {}

  read(now: Date = new Date()): Snapshot<T> {
    const stale = isStale(this.computedAt, now, this.freshMs);
    if (stale) void this.refresh();
    return {
      computedAt: this.computedAt,
      projects: this.projects,
      computing: this.computedAt === null,
      stale,
    };
  }

  // Never awaited by a request. A failed scan leaves the previous snapshot in
  // place — stale data plus an honest stamp beats an empty surface.
  async refresh(): Promise<void> {
    if (this.refreshing) return;
    this.refreshing = true;
    try {
      const next = await Promise.resolve().then(() => this.compute());
      this.projects = next;
      this.computedAt = new Date().toISOString();
    } catch {
      // Keep what we had.
    } finally {
      this.refreshing = false;
    }
  }
}

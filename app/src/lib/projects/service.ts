// T-projects-rework-02 — the one wired instance: scan the real repos, keep
// the last result, serve it without blocking.
//
// Archive is the only stored state on this surface, and it is stored because
// archiving is a deliberate act by Samy, not a fact about the repo. Everything
// else is derived, which is why nothing here goes stale when he stops looking.
import { listDocs } from "@/lib/server-db";
import { gatherSignals, listProjectSources, type ProjectEntry } from "./signals";
import { SnapshotCache, type Snapshot } from "./snapshot";

export const ARCHIVE_COLLECTION = "users/local/projectArchive";

function archivedNames(): ReadonlySet<string> {
  try {
    const docs = listDocs(ARCHIVE_COLLECTION, { where: [["archived", "==", true]] });
    return new Set(docs.map((d) => String(d.name ?? "")));
  } catch {
    // The archive store is an optimisation on top of derived state. If it
    // cannot be read, show every project rather than showing none.
    return new Set();
  }
}

function scan(): ProjectEntry[] {
  const archived = archivedNames();
  const now = new Date();
  return listProjectSources().map((source) => gatherSignals(source, archived, now));
}

const cache = new SnapshotCache<ProjectEntry>(scan);

export function readProjects(now: Date = new Date()): Snapshot<ProjectEntry> {
  return cache.read(now);
}

// Called after an archive verdict so the surface reflects it immediately
// instead of waiting out the freshness window.
export function invalidateProjects(): Promise<void> {
  return cache.refresh();
}

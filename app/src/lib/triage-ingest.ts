// Enqueueing a saved URL into the triage queue, shared by every way one can
// arrive: the X/IG/Firefox grabbers (POST /api/triage/ingest) and a bookmark
// rescued from the backfill deck (POST /api/triage/backfill/verdict).
//
// Dedup is by canonical URL so the same tweet captured twice — or a bookmark
// the nightly grabber already carried — inserts once.
import { listDocs, createDoc } from "./server-db";
import { canonicalizeUrl, inferSource, type TriageSource } from "./triage";

export const TRIAGE_COLLECTION = "users/local/triageQueue";

const VALID_SOURCES: TriageSource[] = ["x", "instagram", "other"];

export interface EnqueueInput {
  url: string;
  source?: string;
  savedAt?: string | Date;
  folder?: string;
}

export interface EnqueueResult {
  id: string;
  duplicate: boolean;
  source: TriageSource;
}

export function enqueueTriageItem(input: EnqueueInput): EnqueueResult {
  const url = canonicalizeUrl(input.url);
  // An explicit source is honored, but callers are expected to leave it unset:
  // inference off the hostname is what routes the study step's fetcher, so a
  // bookmarked tweet must stay "x" regardless of which grabber found it.
  const source: TriageSource =
    input.source && VALID_SOURCES.includes(input.source as TriageSource)
      ? (input.source as TriageSource)
      : inferSource(url);

  const existing = listDocs(TRIAGE_COLLECTION, { where: [["url", "==", url]] });
  if (existing.length > 0) {
    return { id: existing[0].id as string, duplicate: true, source };
  }

  const parsed =
    input.savedAt instanceof Date
      ? input.savedAt
      : input.savedAt && !Number.isNaN(Date.parse(input.savedAt))
        ? new Date(input.savedAt)
        : new Date();

  const folder = typeof input.folder === "string" ? input.folder.trim().slice(0, 80) : "";

  const id = createDoc(TRIAGE_COLLECTION, {
    url,
    rawUrl: input.url,
    source,
    savedAt: { __date: parsed.toISOString() },
    status: "queued",
    createdAt: { __date: new Date().toISOString() },
    ...(folder ? { folder } : {}),
  });

  return { id, duplicate: false, source };
}

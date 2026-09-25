// Enqueueing a saved URL into the triage queue, shared by every way one can
// arrive: the X/IG/Firefox grabbers (POST /api/triage/ingest) and a bookmark
// rescued from the backfill deck (POST /api/triage/backfill/verdict).
//
// Dedup is by canonical URL so the same tweet captured twice — or a bookmark
// the nightly grabber already carried — inserts once.
import { listDocs, createDoc, updateDoc, runInTransaction } from "./server-db";
import { canonicalizeUrl, inferSource, type TriageSource } from "./triage";

export const TRIAGE_COLLECTION = "users/local/triageQueue";
export const TRIAGE_LINK_ARCHIVE = "users/local/triageLinkArchive";

const VALID_SOURCES: TriageSource[] = ["x", "instagram", "other"];

export interface EnqueueInput {
  url: string;
  source?: string;
  savedAt?: string | Date;
  folder?: string;
  // Grabber-supplied thumbnail (design-RSS's featured image, so far) — a
  // destination hint for the vault note, not fetched/validated here.
  previewImage?: string;
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

  const parsed =
    input.savedAt instanceof Date
      ? input.savedAt
      : input.savedAt && !Number.isNaN(Date.parse(input.savedAt))
        ? new Date(input.savedAt)
        : new Date();

  const folder = typeof input.folder === "string" ? input.folder.trim().slice(0, 80) : "";
  const previewImage =
    typeof input.previewImage === "string" && /^https?:\/\//.test(input.previewImage)
      ? input.previewImage.slice(0, 2000)
      : "";

  return runInTransaction(() => {
    const existing = listDocs(TRIAGE_COLLECTION, { where: [["url", "==", url]] });
    if (existing.length > 0) {
      const prior = existing[0];
      const priorSource = prior.source;
      // A replay must archive the original capture metadata, not replace it
      // with the canonical URL and current replay time.
      archiveLink({
        url,
        rawUrl: typeof prior.rawUrl === "string" ? prior.rawUrl : input.url,
        source: typeof priorSource === "string" && VALID_SOURCES.includes(priorSource as TriageSource)
          ? priorSource as TriageSource
          : source,
        triageItemId: prior.id as string,
        capturedAt: prior.savedAt as string | Date | { __date?: unknown } | undefined,
      });
      return { id: prior.id as string, duplicate: true, source };
    }

    const id = createDoc(TRIAGE_COLLECTION, {
      url,
      rawUrl: input.url,
      source,
      savedAt: { __date: parsed.toISOString() },
      status: "queued",
      createdAt: { __date: new Date().toISOString() },
      ...(folder ? { folder } : {}),
      ...(previewImage ? { previewImage } : {}),
    });

    archiveLink({ url, rawUrl: input.url, source, triageItemId: id, capturedAt: parsed });
    return { id, duplicate: false, source };
  });
}

function archiveLink(input: {
  url: string;
  rawUrl: string;
  source: TriageSource;
  triageItemId: string;
  capturedAt?: string | Date | { __date?: unknown };
}): void {
  const existing = listDocs(TRIAGE_LINK_ARCHIVE, { where: [["url", "==", input.url]], limit: 1 });
  const capturedAt =
    input.capturedAt instanceof Date
      ? input.capturedAt.toISOString()
      : typeof input.capturedAt === "string"
        ? input.capturedAt
        : typeof input.capturedAt?.__date === "string"
          ? input.capturedAt.__date
          : "";
  const captured = capturedAt && !Number.isNaN(Date.parse(capturedAt)) ? new Date(capturedAt) : null;
  if (existing.length) {
    // A prior backfill may have used replay time for a source record with no
    // savedAt. Correct that once, while retaining the archive's read-only API.
    if (!captured && existing[0].capturedAt) {
      updateDoc(TRIAGE_LINK_ARCHIVE, existing[0].id, { capturedAt: null, captureDateMissing: true });
    }
    return;
  }
  createDoc(TRIAGE_LINK_ARCHIVE, {
    url: input.url,
    rawUrl: input.rawUrl,
    source: input.source,
    triageItemId: input.triageItemId,
    capturedAt: captured ? { __date: captured.toISOString() } : null,
    ...(captured ? {} : { captureDateMissing: true }),
    archivedAt: { __date: new Date().toISOString() },
  });
}

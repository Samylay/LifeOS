// Shared lead ingest. Two callers:
//   - POST /api/leads — batch, from scout/demand_scout.py (Codeur.com RSS)
//   - the Pain deck's keep verdict — one at a time, from /api/pain/verdict
//
// Both land in the same collection on purpose: a Codeur brief and a kept pain
// point are different objects but the same NEXT ACTION — talk to this person —
// and /leads is the only surface that tracks whether that happened. A keep
// that lands anywhere without a status is a shelf.
//
// A pain lead carries no budget (the person is describing a problem, not
// hiring), so its budget pill renders blank. That is deliberate: an empty
// budget on the card is the visible difference between "would pay" and "pays".
import { createDoc, listDocs } from "./server-db";

export const LEADS_COLLECTION = "users/local/leads";

export interface LeadInput {
  source?: unknown;
  extId?: unknown;
  title?: unknown;
  url?: unknown;
  budget?: unknown;
  budgetFloor?: unknown;
  categories?: unknown;
  brief?: unknown;
  postedAt?: unknown;
}

const str = (v: unknown, fallback = "") => (typeof v === "string" ? v : fallback);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

function dateMarker(v: unknown): { __date: string } {
  const iso = typeof v === "string" && !Number.isNaN(Date.parse(v)) ? v : new Date().toISOString();
  return { __date: new Date(iso).toISOString() };
}

/**
 * Idempotent on (source, extId): re-posting an overlapping window never
 * duplicates. `id` is null only when extId is missing — the caller counts that
 * as skipped.
 */
export function enqueueLead(raw: LeadInput): { id: string | null; duplicate: boolean } {
  const source = str(raw.source, "unknown");
  const extId = str(raw.extId);
  if (!extId) return { id: null, duplicate: false };

  const existing = listDocs(LEADS_COLLECTION, {
    where: [
      ["source", "==", source],
      ["extId", "==", extId],
    ],
  });
  if (existing.length > 0) return { id: existing[0].id, duplicate: true };

  const now = new Date().toISOString();
  const id = createDoc(LEADS_COLLECTION, {
    source,
    extId,
    title: str(raw.title, "(untitled)"),
    url: str(raw.url),
    budget: str(raw.budget, "non précisé"),
    budgetFloor: num(raw.budgetFloor),
    categories: str(raw.categories),
    brief: str(raw.brief),
    postedAt: dateMarker(raw.postedAt),
    status: "new",
    createdAt: { __date: now },
    updatedAt: { __date: now },
  });
  return { id, duplicate: false };
}

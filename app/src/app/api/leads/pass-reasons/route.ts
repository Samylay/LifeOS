// Bulk pass-reason retrieval — the feedback signal scout's upstream filter
// consumes (spec.md: "passing teaches the filter"). Deliberately its own
// narrow endpoint rather than pointing scout at the generic
// `/api/data/users/local/leads` passthrough: that would leak every field a
// lead carries (title, brief, budget…) when the filter only ever needs
// (id, source, reason, when), and it would return every status, not just
// the ones actually passed with a reason from the closed set.
//
//   GET -> { passes: [{ id, source, reason, passedAt }] }
import { NextResponse } from "next/server";
import { LEADS_COLLECTION } from "@/lib/leads-ingest";
import { listDocs } from "@/lib/server-db";
import { selectPassRecords, type PassedLeadDoc } from "@/lib/leads/outcomes";
import { parseStoredDate } from "@/lib/leads/dates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const rows = listDocs(LEADS_COLLECTION) as PassedLeadDoc[];
  const records = selectPassRecords(rows, parseStoredDate);
  return NextResponse.json({
    passes: records.map((r) => ({ ...r, passedAt: r.passedAt ? r.passedAt.toISOString() : null })),
  });
}

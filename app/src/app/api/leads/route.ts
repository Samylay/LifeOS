// Leads ingest — the persistent home for website-build demand found by
// scout/demand_scout.py (Codeur.com RSS today; more sources later) and for
// pain points kept in the /decide Pain deck. Unlike the ephemeral /pager,
// leads live in `users/local/leads` and carry a status the user drives from
// /leads. Ingest is idempotent: a lead is keyed by (source, extId), so
// re-posting an overlapping window never duplicates.
//
// The row shape + dedup live in lib/leads-ingest.ts, shared with the Pain
// deck's keep verdict.
//
//   POST { leads: [{ source, extId, title, url, budget, budgetFloor,
//                     categories, brief, postedAt }] }
//        -> { inserted, skipped }
import { NextRequest, NextResponse } from "next/server";
import { enqueueLead, type LeadInput } from "@/lib/leads-ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: { leads?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const incoming = Array.isArray(body.leads) ? (body.leads as LeadInput[]) : null;
  if (!incoming) {
    return NextResponse.json({ error: "leads[] required" }, { status: 400 });
  }

  let inserted = 0;
  let skipped = 0;

  // Sequential on purpose: each enqueue reads the collection back, so a
  // duplicate *within* one batch is caught by the previous iteration's write —
  // same guarantee the old in-memory key set gave.
  for (const raw of incoming) {
    const { id, duplicate } = enqueueLead(raw);
    if (!id || duplicate) skipped++;
    else inserted++;
  }

  return NextResponse.json({ inserted, skipped });
}

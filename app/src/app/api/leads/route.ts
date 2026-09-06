// Leads ingest + surface — the persistent home for website-build demand found
// by scout/demand_scout.py (Codeur.com RSS today; more sources later) and for
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
//
//   GET -> { leads: [...admitted, each carrying `admissionReason`,
//            `counterparty`, `requirement`, `deadline`, and `relatedWork`],
//            cap, lastDeliveredAt }
//
// GET is the *only* sanctioned way to read leads for display. It exists
// specifically because the generic `/api/data/users/local/leads` passthrough
// (used by every other collection) returns every row with no cap — reading
// leads through it would defeat the one thing this ticket builds: a surface
// that cannot hold more than a handful. `selectAdmittedLeads` (lib/leads/surface.ts)
// enforces the cap here, at the fetch boundary, before anything reaches a
// client that could otherwise widen it.
//
// Ticket 03 adds `relatedWork`: for each admitted lead, the vault (kb.ts's
// FTS search) is queried for Samy's own notes relevant to that lead's
// counterparty/requirement — see lib/leads/related-work.ts. The lookup is
// injected here (this route is the only place kb.ts's filesystem access and
// the pure selection logic meet) so related-work.ts itself stays testable
// with no vault on disk.
import { NextRequest, NextResponse } from "next/server";
import { enqueueLead, LEADS_COLLECTION, type LeadInput } from "@/lib/leads-ingest";
import { listDocs } from "@/lib/server-db";
import { ADMISSION_CAP } from "@/lib/leads/admission";
import { selectAdmittedLeads, lastDeliveredAt, toAdmissionCandidate, type RawLeadDoc } from "@/lib/leads/surface";
import { getLeadsAvailability } from "@/lib/leads/availability-settings";
import { selectRelatedWork, type RelatedWorkNote } from "@/lib/leads/related-work";
import { searchNotes } from "@/lib/kb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const rows = listDocs(LEADS_COLLECTION) as RawLeadDoc[];
  const now = new Date();
  const availability = getLeadsAvailability();
  const admitted = selectAdmittedLeads(rows, now, availability, ADMISSION_CAP);

  type EnrichedLead = RawLeadDoc & {
    admissionReason: string;
    counterparty: string;
    requirement: string;
    deadline: string | null;
    relatedWork: RelatedWorkNote[];
  };

  const byId = new Map(rows.map((r) => [r.id, r]));
  const leads = admitted
    .map((a): EnrichedLead | null => {
      const row = byId.get(a.id);
      if (!row) return null;
      // Reuses ticket 01's own field extraction (counterparty/requirement
      // fallbacks, deadline parsing) rather than re-deriving it here, so the
      // card can never disagree with what admission itself judged.
      const candidate = toAdmissionCandidate(row, now);
      const relatedWork = selectRelatedWork(
        { counterparty: candidate.counterparty, requirement: candidate.requirement },
        searchNotes,
      );
      return {
        ...row,
        admissionReason: a.reason,
        counterparty: candidate.counterparty,
        requirement: candidate.requirement,
        deadline: candidate.deadline ? candidate.deadline.toISOString() : null,
        relatedWork,
      };
    })
    .filter((r): r is EnrichedLead => r !== null);

  const delivered = lastDeliveredAt(rows);

  return NextResponse.json({
    leads,
    cap: ADMISSION_CAP,
    lastDeliveredAt: delivered ? delivered.toISOString() : null,
  });
}

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

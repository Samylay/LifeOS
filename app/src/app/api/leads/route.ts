// Leads ingest — the persistent home for website-build demand found by
// scout/demand_scout.py (Codeur.com RSS today; more sources later). Unlike the
// ephemeral /pager, leads live in `users/local/leads` and carry a status the
// user drives from /leads. Ingest is idempotent: a lead is keyed by
// (source, extId), so re-posting an overlapping window never duplicates.
//
//   POST { leads: [{ source, extId, title, url, budget, budgetFloor,
//                     categories, brief, postedAt }] }
//        -> { inserted, skipped }
import { NextRequest, NextResponse } from "next/server";
import { createDoc, listDocs } from "@/lib/server-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COLLECTION = "users/local/leads";

type IncomingLead = {
  source?: unknown;
  extId?: unknown;
  title?: unknown;
  url?: unknown;
  budget?: unknown;
  budgetFloor?: unknown;
  categories?: unknown;
  brief?: unknown;
  postedAt?: unknown;
};

const str = (v: unknown, fallback = "") => (typeof v === "string" ? v : fallback);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

function dateMarker(v: unknown): { __date: string } {
  const iso = typeof v === "string" && !Number.isNaN(Date.parse(v)) ? v : new Date().toISOString();
  return { __date: new Date(iso).toISOString() };
}

export async function POST(req: NextRequest) {
  let body: { leads?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const incoming = Array.isArray(body.leads) ? (body.leads as IncomingLead[]) : null;
  if (!incoming) {
    return NextResponse.json({ error: "leads[] required" }, { status: 400 });
  }

  // Existing keys for idempotent ingest.
  const existing = new Set(
    listDocs(COLLECTION).map((d) => `${d.source}:${d.extId}`)
  );

  let inserted = 0;
  let skipped = 0;
  const now = new Date().toISOString();

  for (const raw of incoming) {
    const source = str(raw.source, "unknown");
    const extId = str(raw.extId);
    if (!extId) {
      skipped++;
      continue;
    }
    const key = `${source}:${extId}`;
    if (existing.has(key)) {
      skipped++;
      continue;
    }
    existing.add(key);
    createDoc(COLLECTION, {
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
    inserted++;
  }

  return NextResponse.json({ inserted, skipped });
}

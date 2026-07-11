// Pending NEEDS-SAMY decision cards for the /decide deck. Items are scanned/
// enriched host-side by ~/services/triage/decisions.py (the container only
// sees ~/apps and ~/infra read-only) and land in this collection via
// /api/data; verdicts recorded here are written back into the ROADMAPs by the
// same script's `apply` step on its nightly run.
import { NextResponse } from "next/server";
import { listDocs } from "@/lib/server-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const items = listDocs("users/local/decisionQueue", {
    where: [["status", "==", "pending"]],
    orderBy: ["createdAt", "asc"],
  });
  return NextResponse.json({ items });
}

// T58 deck feed: tag + topic-cluster proposals, combined (map ticket 11 —
// one queue, not two). See lib/proposals.ts for the trigger + cap.
import { NextResponse } from "next/server";
import { getProposals } from "@/lib/proposals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ items: getProposals() });
}

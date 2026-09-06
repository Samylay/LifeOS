import { NextResponse } from "next/server";
import { getFinanceOverview } from "@/lib/finance-overview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Read-only for the /finance "burn on open" surface (ticket 02). Derives
// burn from synced transactions only — never accepts a body, never writes.
export async function GET() {
  return NextResponse.json(getFinanceOverview());
}

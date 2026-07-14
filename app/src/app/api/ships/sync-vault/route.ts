import { NextRequest, NextResponse } from "next/server";
import { syncShipsToVault } from "@/lib/ships-vault";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Manual trigger for the ships→vault digest (the scheduler handles the daily
// 05:00 run for the previous day).
// POST /api/ships/sync-vault                  → sync yesterday
// POST /api/ships/sync-vault?date=YYYY-MM-DD  → sync a specific day
export async function POST(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date") || undefined;
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
  }
  try {
    return NextResponse.json(syncShipsToVault(date));
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

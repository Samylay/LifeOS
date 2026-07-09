import { NextRequest, NextResponse } from "next/server";
import { runBrief } from "@/lib/brief/builder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Manual trigger for the morning brief (the scheduler handles the daily run).
// POST /api/brief/run         → build unless today's brief already exists
// POST /api/brief/run?force=1 → rebuild regardless
export async function POST(req: NextRequest) {
  const force = req.nextUrl.searchParams.get("force") === "1";
  try {
    const result = await runBrief({ force });
    return NextResponse.json({
      ran: result.ran,
      reason: result.reason,
      date: result.brief?.date,
      cards: result.brief?.cards.map((c) => ({ id: c.id, status: c.status, error: c.error })),
    });
  } catch (e) {
    return NextResponse.json(
      { ran: false, reason: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

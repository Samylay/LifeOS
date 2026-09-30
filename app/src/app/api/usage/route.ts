import { NextRequest, NextResponse } from "next/server";
import { recordUsage, usageSummary } from "@/lib/usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST { route } counts one visit. GET ?days=30 returns visits per route.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  return new NextResponse(null, { status: recordUsage(body?.route) ? 204 : 400 });
}

export async function GET(req: NextRequest) {
  const days = Math.min(Math.max(Number(req.nextUrl.searchParams.get("days")) || 30, 1), 365);
  return NextResponse.json({ days, routes: usageSummary(days) }, { headers: { "Cache-Control": "no-store" } });
}

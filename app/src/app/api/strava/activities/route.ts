import { NextRequest, NextResponse } from "next/server";
import { isStravaConfigured } from "@/lib/strava";
import { getActivitiesSince } from "@/lib/strava-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!isStravaConfigured()) {
    return NextResponse.json({ ok: false, reason: "not configured" });
  }

  const after = req.nextUrl.searchParams.get("after") ?? "1970-01-01T00:00:00Z";
  const limitParam = req.nextUrl.searchParams.get("limit");
  const limit = limitParam ? Number(limitParam) : undefined;

  const rows = getActivitiesSince(after, limit && Number.isFinite(limit) ? limit : undefined);
  return NextResponse.json({ ok: true, activities: rows });
}

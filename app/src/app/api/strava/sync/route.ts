import { NextRequest, NextResponse } from "next/server";
import { syncActivities } from "@/lib/strava-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const full = req.nextUrl.searchParams.get("full") === "1";
  const result = await syncActivities({ full });
  return NextResponse.json(result);
}

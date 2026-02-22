import { NextRequest, NextResponse } from "next/server";
import { fetchActivities } from "@/lib/garmin-service";
import { verifyAuth, unauthorized } from "@/lib/verify-auth";

export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth) return unauthorized();

  try {
    const { searchParams } = new URL(req.url);
    const start = parseInt(searchParams.get("start") || "0", 10);
    const limit = parseInt(searchParams.get("limit") || "20", 10);

    const activities = await fetchActivities(auth.uid, start, limit);
    return NextResponse.json({ activities });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to fetch activities";
    const status = message === "Not connected to Garmin" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

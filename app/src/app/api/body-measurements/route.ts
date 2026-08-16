import { NextRequest, NextResponse } from "next/server";
import { listRecentBodyMeasurements } from "@/lib/body-measurements";
import { verifyAuth, unauthorized } from "@/lib/verify-auth";

// Weight/kcal history for the /workouts sparkline. Read-only — the nightly
// scheduler is the only writer.
export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth) return unauthorized();

  const weeksParam = req.nextUrl.searchParams.get("weeks");
  const weeks = weeksParam ? Number(weeksParam) : 8;
  const measurements = listRecentBodyMeasurements(Number.isFinite(weeks) && weeks > 0 ? weeks : 8);
  return NextResponse.json({ measurements });
}

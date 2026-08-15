import { NextRequest, NextResponse } from "next/server";
import { fetchDailyNutrition, fetchWeight } from "@/lib/garmin-service";
import { verifyAuth, unauthorized } from "@/lib/verify-auth";

// Calories in (MyFitnessPal, synced into Garmin) and the day's weigh-in.
// Both are null-tolerant: a day with no MFP log and no weigh-in is a normal
// state, not an error.
export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth) return unauthorized();

  try {
    const dateStr = req.nextUrl.searchParams.get("date");
    const date = dateStr ? new Date(dateStr) : new Date();
    if (Number.isNaN(date.getTime())) {
      return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    }

    const [nutrition, weighIn] = await Promise.all([
      fetchDailyNutrition(auth.uid, date),
      fetchWeight(auth.uid, date),
    ]);

    return NextResponse.json({ nutrition, weighIn });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to fetch nutrition";
    const status = message === "Not connected to Garmin" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

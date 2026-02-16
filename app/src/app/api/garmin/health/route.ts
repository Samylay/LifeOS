import { NextRequest, NextResponse } from "next/server";
import {
  fetchSteps,
  fetchSleepData,
  fetchHeartRate,
} from "@/lib/garmin-service";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const dateStr = searchParams.get("date");
    const date = dateStr ? new Date(dateStr) : undefined;

    const [steps, sleep, heartRate] = await Promise.all([
      fetchSteps(date).catch(() => 0),
      fetchSleepData(date).catch(() => null),
      fetchHeartRate(date).catch(() => null),
    ]);

    return NextResponse.json({
      calendarDate:
        dateStr || new Date().toISOString().split("T")[0],
      steps,
      heartRate,
      sleep,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to fetch health data";
    const status = message === "Not connected to Garmin" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

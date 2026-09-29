import { NextRequest, NextResponse } from "next/server";
import { pushRunWorkouts } from "@/lib/garmin-service";
import { buildGarminRun } from "@/lib/garmin-workouts";
import { PLAN_WEEKS, dateOfSession, planPosition, sessionsForWeek } from "@/lib/training-plan";
import { verifyAuth, unauthorized } from "@/lib/verify-auth";

const DAY = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// POST { weeks?: number } pushes the runs of the current plan week and the
// following weeks (default 2, max 4) to Garmin Connect, dated in the plan.
export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth) return unauthorized();
  try {
    const body = (await req.json().catch(() => ({}))) as { weeks?: number };
    const count = Math.min(Math.max(Math.trunc(body.weeks ?? 2), 1), 4);
    const from = planPosition().week;
    const planned = [];
    for (let week = from; week < from + count && week <= PLAN_WEEKS; week++) {
      for (const s of sessionsForWeek(week)) {
        if (!s.run) continue;
        const name = `LifeOS W${week} ${DAY[s.day]} ${s.title}`;
        const description = s.lines.join(". ");
        planned.push({ name, description, date: dateOfSession(week, s.day), workout: buildGarminRun(s.run, name, description) });
      }
    }
    const result = await pushRunWorkouts(auth.uid, planned);
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to push workouts";
    return NextResponse.json({ error: message }, { status: message === "Not connected to Garmin" ? 401 : 500 });
  }
}

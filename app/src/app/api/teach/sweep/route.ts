// Abandonment sweep + due-session feed.
// POST: force-end stale live sessions and retry unrouted ones → Hermes.
//   Called by the nightly grabbers cron and manually. GET: topics scheduled
//   for today or earlier — consumed by the morning attention push.
import { NextResponse } from "next/server";
import { dueTopics, sweepStaleSessions } from "@/lib/teach";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const result = await sweepStaleSessions();
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "sweep failed" },
      { status: 500 }
    );
  }
}

export async function GET() {
  const today = new Date().toISOString().slice(0, 10);
  return NextResponse.json({ due: dueTopics(today) });
}

// POST /api/feed/generate — manual trigger for the nightly generation (used
// by the /feed empty state and for testing without waiting for 03:00).
// Long-running (2 claude -p calls per topic); self-hosted node server, no
// serverless timeout.
import { NextResponse } from "next/server";
import { runFeedGeneration } from "@/lib/feed-generator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const result = await runFeedGeneration();
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "generation failed" },
      { status: 500 }
    );
  }
}

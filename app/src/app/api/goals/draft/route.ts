import { NextRequest, NextResponse } from "next/server";
import { claudeCliEnabled, draftGoalPlan } from "@/lib/claude-cli";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!claudeCliEnabled()) {
    return NextResponse.json(
      { error: "claude-cli not enabled (set GEN_PROVIDER=claude-cli)" },
      { status: 503 }
    );
  }
  try {
    const { title, quarter, why, outcome } = await req.json();
    if (!title || typeof title !== "string" || !title.trim()) {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }
    const draft = await draftGoalPlan({ title: title.trim(), quarter, why, outcome });
    return NextResponse.json({ draft });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "failed to draft plan" },
      { status: 500 }
    );
  }
}

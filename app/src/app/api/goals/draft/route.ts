import { NextRequest, NextResponse } from "next/server";
import { codexEnabled, draftGoalPlan } from "@/lib/claude-cli";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!codexEnabled()) {
    return NextResponse.json(
      { error: "Codex bridge not enabled (set GEN_PROVIDER=codex)" },
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

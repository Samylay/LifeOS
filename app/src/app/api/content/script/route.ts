import { NextRequest, NextResponse } from "next/server";
import { claudeCliEnabled, generateJson } from "@/lib/claude-cli";
import { draftScriptForIdea } from "@/lib/content-scripting";
import type { ContentPillar } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PILLARS: ContentPillar[] = ["build-log", "workflow-win", "under-the-hood"];

export async function POST(req: NextRequest) {
  if (!claudeCliEnabled()) {
    return NextResponse.json(
      { error: "claude-cli not enabled (set GEN_PROVIDER=claude-cli)" },
      { status: 503 }
    );
  }
  try {
    const { title, pillar, hookFormula, episode, notes } = await req.json();
    if (!title || typeof title !== "string" || !title.trim()) {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }
    if (!PILLARS.includes(pillar)) {
      return NextResponse.json({ error: "invalid pillar" }, { status: 400 });
    }
    if (typeof hookFormula !== "number" || hookFormula < 1 || hookFormula > 12) {
      return NextResponse.json(
        { error: "hookFormula (1–12) is required — an idea without one is a topic, not a post" },
        { status: 400 }
      );
    }
    const draft = await draftScriptForIdea(
      { title: title.trim(), pillar, hookFormula, episode, notes },
      generateJson
    );
    return NextResponse.json({ draft });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "failed to draft script" },
      { status: 500 }
    );
  }
}

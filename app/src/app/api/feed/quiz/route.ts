// POST /api/feed/quiz { cardId, correct } — the ONLY path that moves a card's
// resurfacing interval (SM-2-lite: correct advances, wrong resets).
import { NextRequest, NextResponse } from "next/server";
import { applyQuizResult } from "@/lib/feed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const cardId = String(body?.cardId ?? "");
  if (!cardId || typeof body?.correct !== "boolean") {
    return NextResponse.json({ error: "cardId and boolean correct required" }, { status: 400 });
  }
  const card = applyQuizResult(cardId, body.correct);
  if (!card) return NextResponse.json({ error: "card not found" }, { status: 404 });
  return NextResponse.json({ card });
}

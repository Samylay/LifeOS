// POST /api/feed/react { cardId, type: keep|kill|flag } — keep flips the card
// postable + writes a learning record on its topic; kill/flag remove it from
// serving forever. Never touches intervalIndex (quiz results only).
import { NextRequest, NextResponse } from "next/server";
import { applyReaction } from "@/lib/feed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const cardId = String(body?.cardId ?? "");
  const type = String(body?.type ?? "");
  if (!cardId || !["keep", "kill", "flag"].includes(type)) {
    return NextResponse.json({ error: "cardId and type keep|kill|flag required" }, { status: 400 });
  }
  const card = applyReaction(cardId, type as "keep" | "kill" | "flag");
  if (!card) return NextResponse.json({ error: "card not found" }, { status: 404 });
  return NextResponse.json({ card });
}

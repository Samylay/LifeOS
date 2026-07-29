// POST /api/feed/shown { cardId } — exposure marking, fired by the client
// when a card has actually been on screen (≥50% visible for ≥1s), not at
// serve time. Keeps timesShown/lastShownAt honest: an unfetched tail of a
// batch never counts as seen.
import { NextRequest, NextResponse } from "next/server";
import { getCard, markShown } from "@/lib/feed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const cardId = String(body?.cardId ?? "");
  if (!cardId) return NextResponse.json({ error: "cardId required" }, { status: 400 });
  if (!getCard(cardId)) return NextResponse.json({ error: "card not found" }, { status: 404 });
  markShown(cardId);
  return NextResponse.json({ ok: true });
}

// GET /api/feed/next?count=10 — plan a batch (serving constraints live in
// feed.ts, unit-tested) and shuffle quiz options at serve time with the
// answerIndex remapped. Exposure is NOT marked here — the client POSTs
// /api/feed/shown when a card is actually seen.
import { NextRequest, NextResponse } from "next/server";
import { listCards, planFeedBatch, shuffleQuiz } from "@/lib/feed";
import { maybeTopUp } from "@/lib/feed-generator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function seedFor(cardId: string, timesShown: number): number {
  let h = timesShown + 1;
  for (const ch of cardId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

export async function GET(req: NextRequest) {
  const raw = Number(req.nextUrl.searchParams.get("count") ?? 10);
  const count = Number.isFinite(raw) ? Math.min(Math.max(Math.floor(raw), 1), 30) : 10;
  const all = listCards();
  const batch = planFeedBatch(all, Date.now(), count);
  // Refill in the background before the pool runs dry (fire-and-forget;
  // locked + cooled down inside).
  maybeTopUp(all.filter((c) => c.status === "fresh").length - batch.length);
  const cards = batch.map((card) => ({
    ...card,
    quiz: card.quiz ? shuffleQuiz(card.quiz, seedFor(card.id, card.timesShown)) : undefined,
    review: card.status === "kept" && card.keptAt ? { keptAt: card.keptAt } : undefined,
  }));
  return NextResponse.json({ cards });
}

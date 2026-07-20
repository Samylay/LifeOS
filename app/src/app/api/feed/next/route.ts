// GET /api/feed/next?count=10 — plan a batch (serving constraints live in
// feed.ts, unit-tested), mark each served card shown, and shuffle quiz
// options at serve time with the answerIndex remapped.
import { NextRequest, NextResponse } from "next/server";
import { listCards, markShown, planFeedBatch, shuffleQuiz } from "@/lib/feed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function seedFor(cardId: string, timesShown: number): number {
  let h = timesShown + 1;
  for (const ch of cardId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

export async function GET(req: NextRequest) {
  const count = Math.min(Math.max(Number(req.nextUrl.searchParams.get("count") ?? 10), 1), 30);
  const batch = planFeedBatch(listCards(), Date.now(), count);
  for (const card of batch) markShown(card.id);
  const cards = batch.map((card) => ({
    ...card,
    quiz: card.quiz ? shuffleQuiz(card.quiz, seedFor(card.id, card.timesShown)) : undefined,
    review: card.status === "kept" && card.keptAt ? { keptAt: card.keptAt } : undefined,
  }));
  return NextResponse.json({ cards });
}

// Quorky Digest — now sourced from the in-app news aggregator (src/lib/news)
// instead of the old n8n → DIGEST_POINTER handoff. Renders the top few
// headlines from today's edition as a brief card, linking to /news for the
// full list. Omitted (fetch → null) when no edition exists for today yet.
import { card, type FetchResult } from "../registry";
import { latestEdition } from "@/lib/news/engine";
import { BUCKET_LABELS } from "@/lib/news/types";
import { todayInTz } from "../tz";

const MAX_CARD_ITEMS = 6;

export async function fetch(): Promise<FetchResult> {
  const edition = latestEdition();
  if (!edition || edition.date !== todayInTz().dateStr || edition.items.length === 0) return null;

  const headlines = edition.items.slice(0, MAX_CARD_ITEMS).map((it) => ({
    title: it.title,
    link: it.link,
    source: it.source,
    section: BUCKET_LABELS[it.bucket],
    score: it.score,
    summary: it.summary,
  }));

  return card({
    id: "quorky_digest",
    type: "quorky_digest",
    priority: "state",
    status: "neutral",
    title: "Quorky Digest",
    body: { edition_date: edition.date, total: edition.items.length, headlines },
    link: "/news",
  });
}

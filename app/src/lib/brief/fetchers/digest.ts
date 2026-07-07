// Quorky Digest — v1 stub, per the original spec.
//
// The n8n "Daily News Digest" currently goes to Telegram only; there is no web
// edition to link. If a future digest run drops a JSON pointer at
// DIGEST_POINTER ({"date": "YYYY-MM-DD", "url": "..."}), we render a link card
// for today's edition; otherwise the card is omitted entirely (fetch → null).

import fs from "node:fs";
import { card, type FetchResult } from "../registry";
import { todayInTz } from "../tz";

const DIGEST_POINTER = process.env.DIGEST_POINTER || "/data/digest-latest.json";

export async function fetch(): Promise<FetchResult> {
  let info: { date?: string; url?: string };
  try {
    info = JSON.parse(fs.readFileSync(DIGEST_POINTER, "utf8"));
  } catch {
    return null;
  }

  if (info.date !== todayInTz().dateStr || !info.url) return null;

  return card({
    id: "quorky_digest", type: "quorky_digest", priority: "state", status: "neutral",
    title: "Quorky Digest", body: {}, link: info.url,
  });
}

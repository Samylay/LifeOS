// FT headlines, filtered to Samy's beats.
//
// History: the original spec pointed at tomorrowspapers.co.uk front pages, but
// that site went image-only (2026-07). We use the FT's own homepage RSS, which
// carries headline + standfirst text. Filter: tech/AI, cybersecurity,
// markets/fintech, Japan, Europe.

import { card, type FetchResult } from "../registry";
import { todayInTz } from "../tz";
import { fetchRssItems } from "./rss";

const FEED_URL = "https://www.ft.com/rss/home/international";
const MAX_HEADLINES = 8;

const TOPIC_KEYWORDS: Record<string, string[]> = {
  "tech/AI": [
    "ai", "artificial intelligence", "openai", "anthropic", "chip", "semiconductor",
    "tech", "software", "nvidia", "google", "microsoft", "apple", "meta", "startup",
    "data centre", "data center", "robot",
  ],
  cybersecurity: ["cyber", "hack", "ransomware", "breach", "malware", "espionage", "leak"],
  "markets/fintech": [
    "market", "stocks", "bond", "yield", "bank", "fintech", "crypto", "bitcoin",
    "currency", "inflation", "rates", "fed", "ecb", "ipo", "hedge fund", "private equity",
  ],
  Japan: ["japan", "tokyo", "boj", "yen", "nikkei"],
  Europe: ["europe", "eu ", "brussels", "france", "germany", "ecb", "eurozone", "nato"],
};

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function topics(text: string): string[] {
  const low = ` ${text.toLowerCase()} `;
  const found: string[] = [];
  for (const [topic, words] of Object.entries(TOPIC_KEYWORDS)) {
    if (words.some((w) => new RegExp(`\\b${escapeRe(w.trim())}\\b`).test(low))) found.push(topic);
  }
  return found;
}

export async function fetch(): Promise<FetchResult> {
  const items = await fetchRssItems(FEED_URL, { "User-Agent": "lifeos-brief/1.0" });

  const headlines: { text: string; topics: string[] }[] = [];
  for (const item of items) {
    const t = topics(`${item.title} ${item.description}`);
    if (!t.length) continue;
    headlines.push({ text: item.title, topics: t });
    if (headlines.length >= MAX_HEADLINES) break;
  }

  return card({
    id: "ft_headlines", type: "ft_headlines", priority: "state", status: "green",
    title: "FT headlines",
    body: { edition_date: todayInTz().dateStr, headlines },
    link: "https://www.ft.com",
  });
}

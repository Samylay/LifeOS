// Fuite du jour — latest French data leaks from bonjourlafuite.eu.org's RSS.
//
// Feed item shape (checked 2026-07-02): title = "<emoji> OrgName" where the
// emoji encodes severity (🟢/🟠/🔴), description = either an HTML <ul> of
// leaked data types or a plain-text note ("13 000 agents").

import { card, type FetchResult } from "../registry";
import { fetchRssItems } from "./rss";

const FEED_URL = "https://bonjourlafuite.eu.org/feed.xml";
const SITE_URL = "https://bonjourlafuite.eu.org/";
const MAX_AGE_DAYS = 7;
const MAX_ENTRIES = 5;

const EMOJI_STATUS: [string, "green" | "orange" | "red"][] = [
  ["🟢", "green"],
  ["🟠", "orange"],
  ["🔴", "red"],
];

function dataTypes(description: string): string[] {
  const items = [...description.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) =>
    m[1].replace(/<[^>]+>/g, "").trim()
  );
  if (items.length) return items;
  const text = description.replace(/<[^>]+>/g, "").trim();
  return text ? [text] : [];
}

export async function fetch(): Promise<FetchResult> {
  const items = await fetchRssItems(FEED_URL);
  const cutoff = Date.now() - MAX_AGE_DAYS * 86_400_000;

  const entries: { org: string; status: string; data_types: string[]; url: string }[] = [];
  for (const item of items) {
    const when = item.pubDate ? Date.parse(item.pubDate) : NaN;
    if (!Number.isNaN(when) && when < cutoff) continue;

    let status = "green";
    let org = item.title;
    for (const [emoji, s] of EMOJI_STATUS) {
      if (item.title.startsWith(emoji)) {
        status = s;
        org = item.title.slice(emoji.length).trim();
        break;
      }
    }
    entries.push({ org, status, data_types: dataTypes(item.description), url: SITE_URL });
    if (entries.length >= MAX_ENTRIES) break;
  }

  return card({
    id: "fuite", type: "fuite", priority: "state",
    status: entries.some((e) => e.status === "red") ? "amber" : "green",
    title: "Fuite du jour", body: { entries }, link: SITE_URL,
  });
}

// Minimal RSS <item> extraction — enough for the two feeds we consume
// (bonjourlafuite, FT). Regex-based on purpose: no XML dependency for two
// simple, stable feeds. Handles CDATA and entity-escaped text.

export interface RssItem {
  title: string;
  description: string;
  pubDate: string;
}

function unwrap(s: string): string {
  const cdata = s.match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
  const text = cdata ? cdata[1] : s;
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

function tag(item: string, name: string): string {
  const m = item.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return m ? unwrap(m[1]) : "";
}

export async function fetchRssItems(url: string, headers: Record<string, string> = {}): Promise<RssItem[]> {
  const r = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new Error(`rss fetch ${url} → ${r.status}`);
  const xml = await r.text();
  const items: RssItem[] = [];
  for (const m of xml.matchAll(/<item[\s>][\s\S]*?<\/item>/g)) {
    items.push({
      title: tag(m[0], "title"),
      description: tag(m[0], "description"),
      pubDate: tag(m[0], "pubDate"),
    });
  }
  return items;
}

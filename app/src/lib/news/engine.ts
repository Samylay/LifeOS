// The news pipeline, ported from the n8n "Daily News Digest" code node so it
// runs in-process on the LLM backend LifeOS already uses (`claude -p` via
// claude-cli.ts). Phases: parallel RSS/Atom fetch → dedupe + 24h cutoff →
// interleave by source → best-effort Jina full-text → per-article summarise +
// score against the configured reader profile → bucket → one edition per day.
import { generateJson } from "@/lib/claude-cli";
import { getDoc, setDoc } from "@/lib/server-db";
import { todayInTz } from "@/lib/brief/tz";
import { activeFeeds } from "./feeds";
import {
  EDITIONS_COLLECTION,
  type Bucket,
  type Edition,
  type Feed,
  type NewsItem,
} from "./types";

// The reader profile the LLM scores relevance against. Kept out of this
// (public) repo: set NEWS_READER_PROFILE in the deploy env for a personalized
// lineup; the default is a generic tech/security developer.
const READER_PROFILE =
  process.env.NEWS_READER_PROFILE ||
  "a software developer interested in web development, AI/LLM tooling, and cybersecurity";

const JINA_PREFIX = "https://r.jina.ai/";
const MAX_ARTICLES = 12;
const MIN_SCORE = 3;
const RSS_TIMEOUT = 20_000;
const JINA_TIMEOUT = 25_000;
const CUTOFF_MS = 24 * 60 * 60 * 1000;

interface RawItem {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  source: string;
  bucket: Bucket;
  french: boolean;
}

async function getText(url: string, timeoutMs: number, headers: Record<string, string> = {}): Promise<string> {
  const r = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
}

// Handles both RSS <item> and Atom <entry>, CDATA, and href-style <link>.
function parseFeed(xml: string, feed: Feed): RawItem[] {
  const items: RawItem[] = [];
  const blocks = xml.match(/<(?:item|entry)(?: [^>]*)?>[\s\S]*?<\/(?:item|entry)>/g) ?? [];
  for (const block of blocks) {
    const getTag = (tag: string): string => {
      const re = new RegExp(
        `<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${tag}>` +
          `|<${tag}[^>]*>([\\s\\S]*?)</${tag}>`,
        "i"
      );
      const hit = re.exec(block);
      return hit ? (hit[1] || hit[2] || "").trim() : "";
    };
    const hrefLink = /<link[^>]+href=["']([^"']+)["']/i.exec(block);
    const link = hrefLink ? hrefLink[1] : getTag("link");
    const title = getTag("title") || "Untitled";
    const description = (getTag("description") || getTag("summary") || getTag("content") || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 800);
    const pubDate = getTag("pubDate") || getTag("published") || getTag("updated") || "";
    if (title && link) {
      items.push({ title, link, description, pubDate, source: feed.name, bucket: feed.bucket, french: feed.french });
    }
  }
  return items;
}

function interleave(pool: RawItem[]): RawItem[] {
  const bySource = new Map<string, RawItem[]>();
  for (const it of pool) {
    const arr = bySource.get(it.source) ?? [];
    arr.push(it);
    bySource.set(it.source, arr);
  }
  const out: RawItem[] = [];
  let any = true;
  while (any && out.length < MAX_ARTICLES) {
    any = false;
    for (const arr of bySource.values()) {
      const next = arr.shift();
      if (next) {
        out.push(next);
        any = true;
        if (out.length >= MAX_ARTICLES) break;
      }
    }
  }
  return out;
}

const isYouTube = (url: string) => url.includes("youtube.com") || url.includes("youtu.be");

function scorePrompt(article: RawItem, content: string): string {
  const lang = article.french ? "French" : "English";
  return [
    `You are a news triage assistant for a reader who is ${READER_PROFILE}.`,
    "Respond with ONLY a JSON object, no prose and no code fence:",
    '{"summary": string, "score": number}',
    `- summary: 2-3 sentences in ${lang} highlighting what matters most to this reader.`,
    "- score: integer 1-5 relevance to this reader. 5 = must-know today (major",
    "  vuln/breach touching their stack or self-hosters, significant shifts in AI",
    "  dev tooling or web dev practice). 3 = solid niche interest (security",
    "  research, dev techniques, notable OSS). 1-2 = skip (consumer gadgets,",
    "  funding rounds, crypto markets, corporate reshuffles, celebrity tech,",
    "  generic AI hype).",
    "",
    `Title: ${article.title}`,
    "",
    "Text:",
    content,
  ].join("\n");
}

/**
 * Build (or fetch the cached) news edition for today. Deduped by date: a second
 * call the same day returns the stored edition unless force=true.
 */
export async function runNews(opts: { force?: boolean } = {}): Promise<Edition> {
  const { dateStr } = todayInTz();
  if (!opts.force) {
    const existing = getDoc(EDITIONS_COLLECTION, dateStr) as (Edition & { id: string }) | null;
    if (existing) return existing;
  }

  const feeds = activeFeeds();

  // Phase 1: parallel fetch + parse.
  const fetched = await Promise.allSettled(
    feeds.map((f) => getText(f.url, RSS_TIMEOUT, { "User-Agent": "lifeos-news/1.0" }).then((xml) => parseFeed(xml, f)))
  );
  const cutoff = Date.now() - CUTOFF_MS;
  const seen = new Set<string>();
  let pool: RawItem[] = [];
  for (const r of fetched) {
    if (r.status !== "fulfilled") continue;
    for (const item of r.value) {
      if (!item.link || seen.has(item.link)) continue;
      seen.add(item.link);
      const ts = item.pubDate ? new Date(item.pubDate).getTime() : Date.now();
      if (!Number.isNaN(ts) && ts < cutoff) continue;
      pool.push(item);
    }
  }
  pool = interleave(pool);

  // Phase 2: best-effort full text via Jina (skip YouTube; fall back to description).
  const texts = await Promise.allSettled(
    pool.map((a) =>
      isYouTube(a.link)
        ? Promise.reject(new Error("youtube"))
        : getText(JINA_PREFIX + a.link, JINA_TIMEOUT, { Accept: "text/plain" }).then((t) => t.slice(0, 4000))
    )
  );

  // Phase 3: summarise + score, sequentially (one claude -p at a time).
  const items: NewsItem[] = [];
  for (let i = 0; i < pool.length; i++) {
    const a = pool[i];
    const t = texts[i];
    const content = String((t.status === "fulfilled" ? t.value : a.description) || a.title).slice(0, 3000);
    let summary = a.description || a.title;
    let score = 2;
    try {
      const parsed = await generateJson<{ summary?: string; score?: number }>(scorePrompt(a, content));
      if (typeof parsed.summary === "string" && parsed.summary.trim()) summary = parsed.summary.trim();
      const n = Number(parsed.score);
      if (n >= 1 && n <= 5) score = Math.round(n);
    } catch {
      // Leave the fallback score; a broken article never sinks the run.
    }
    if (score < MIN_SCORE) continue;
    items.push({ title: a.title, link: a.link, source: a.source, bucket: a.bucket, french: a.french, summary, score });
  }
  items.sort((x, y) => y.score - x.score);

  const edition: Edition = { date: dateStr, generatedAt: new Date().toISOString(), items };
  setDoc(EDITIONS_COLLECTION, dateStr, edition as unknown as Record<string, unknown>);
  return edition;
}

export function latestEdition(): Edition | null {
  const { dateStr } = todayInTz();
  const today = getDoc(EDITIONS_COLLECTION, dateStr) as (Edition & { id: string }) | null;
  return today ?? null;
}

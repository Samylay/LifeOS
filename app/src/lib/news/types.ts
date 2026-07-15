// Shared shapes for the in-app news aggregator (migrated from the n8n "Daily
// News Digest" workflow — see docs history / project memory). Feeds and daily
// editions live in the local doc store (server-db) so they can be managed from
// the UI instead of an n8n code node.

export type Bucket = "tech" | "sec" | "video" | "news";

export interface Feed {
  id: string;
  name: string; // display name, e.g. "Krebs on Security"
  url: string; // RSS/Atom feed URL
  bucket: Bucket; // which section it renders under
  french: boolean; // summarise in French
  active: boolean; // paused feeds stay in the list but are skipped
  addedAt: string; // ISO
}

export interface NewsItem {
  title: string;
  link: string;
  source: string; // feed name, or the newsletter's display name ("TLDR AI")
  bucket: Bucket;
  french: boolean;
  tldr: string; // one sentence, <=TLDR_MAX chars — the card's resting state
  summary: string; // 2-3 sentences — revealed when the card is expanded
  score: number; // 1-5 relevance to the configured reader profile
}

// Cap for NewsItem.tldr. The prompt asks for one sentence under this; the
// engine also truncates, since the model treats it as a target, not a limit.
export const TLDR_MAX = 140;

export interface Edition {
  date: string; // YYYY-MM-DD (BRIEF_TZ)
  generatedAt: string; // ISO
  items: NewsItem[];
}

export const FEEDS_COLLECTION = "news_feeds";
export const EDITIONS_COLLECTION = "news_editions";
export const INBOX_COLLECTION = "news_inbox";

// A newsletter email delivered by the Cloudflare Email Worker to
// /api/news/ingest-email. Treated by the next runNews() pass (summarised +
// scored like any other source, bucket "news"), then deleted — the digest
// keeps the summary, the raw email does not linger. See docs/news-aggregator.md.
export interface InboxItem {
  id: string;
  from: string; // sender address
  subject: string;
  text: string; // plain-text body (HTML stripped by the worker)
  link: string; // best-effort "read online" URL, else a mailto: fallback
  links?: string[]; // real href links from the email (confirm/opt-in/unsubscribe)
  receivedAt: string; // ISO, from the worker
  addedAt: string; // ISO, when LifeOS stored it
}

// Inbox items older than this are discarded even if a run never folded them
// (e.g. all editions that day were skipped) — a safety TTL, not the main path.
export const INBOX_TTL_MS = 3 * 24 * 60 * 60 * 1000;

// Seeded on first run when the feeds collection is empty. Mirrors the fixed,
// personalized lineup the n8n workflow landed on (2026-07-13).
export const DEFAULT_FEEDS: Omit<Feed, "id" | "addedAt">[] = [
  { name: "Hacker News", url: "https://hnrss.org/frontpage?points=50", bucket: "tech", french: false, active: true },
  { name: "Simon Willison", url: "https://simonwillison.net/atom/everything/", bucket: "tech", french: false, active: true },
  { name: "Techpresso", url: "https://techpresso.substack.com/feed", bucket: "tech", french: false, active: true },
  { name: "Krebs on Security", url: "https://krebsonsecurity.com/feed/", bucket: "sec", french: false, active: true },
  { name: "The Hacker News", url: "https://feeds.feedburner.com/TheHackersNews", bucket: "sec", french: false, active: true },
  { name: "tl;dr sec", url: "https://tldrsec.com/feed.xml", bucket: "sec", french: false, active: true },
  { name: "The Record", url: "https://therecord.media/feed", bucket: "sec", french: false, active: true },
  { name: "HugoDécrypte", url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCAcAnMF0OrCtUep3Y4M-ZPw", bucket: "video", french: true, active: true },
];

export const BUCKET_LABELS: Record<Bucket, string> = {
  tech: "🤖 Tech & AI",
  sec: "🔐 Sécurité",
  video: "🎥 Vidéos",
  news: "📬 Newsletters",
};

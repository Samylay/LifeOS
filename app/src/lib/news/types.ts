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
  source: string; // feed name
  bucket: Bucket;
  french: boolean;
  summary: string;
  score: number; // 1-5 relevance to the configured reader profile
}

export interface Edition {
  date: string; // YYYY-MM-DD (BRIEF_TZ)
  generatedAt: string; // ISO
  items: NewsItem[];
}

export const FEEDS_COLLECTION = "news_feeds";
export const EDITIONS_COLLECTION = "news_editions";

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

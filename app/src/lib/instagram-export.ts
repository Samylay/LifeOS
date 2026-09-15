import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";

const HOST_EXPORT_ROOT = "/home/quorky/scratch/instagram-export/extracted";
const CONTAINER_EXPORT_ROOT = "/instagram-export";
const MAX_RECORDS = 160;
const MAX_MESSAGES = 240;

export type InstagramRecordKind = "saved" | "liked" | "searches" | "links" | "followers" | "following";

export interface InstagramOverview {
  available: boolean;
  counts: Record<"conversations" | "posts" | "saved" | "liked" | "searches" | "links" | "followers" | "following", number | null>;
  exportGeneratedAt?: string;
}

export interface InstagramConversation {
  id: string;
  title: string;
}

export interface InstagramMessage {
  sender: string;
  text: string;
  timestamp?: string;
}

export interface InstagramRecord {
  title: string;
  url?: string;
  timestamp?: string;
}

export interface InstagramPost {
  path: string;
  caption?: string;
  timestamp?: string;
}

function decodeHtml(value: string) {
  return value
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&#0*64;/gi, "@")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal: string) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function exportRoot() {
  const configured = process.env.INSTAGRAM_EXPORT_PATH;
  const candidates = [configured, CONTAINER_EXPORT_ROOT, HOST_EXPORT_ROOT].filter(Boolean) as string[];
  for (const candidate of candidates) {
    try {
      if ((await fs.stat(candidate)).isDirectory()) return candidate;
    } catch {
      // Try the next read-only location. The caller gets a useful unavailable state.
    }
  }
  return null;
}

async function sourcePath(relativePath: string) {
  const root = await exportRoot();
  if (!root) throw new Error("Instagram export is not mounted");
  const resolved = path.resolve(root, relativePath);
  if (!resolved.startsWith(`${root}${path.sep}`)) throw new Error("Invalid export path");
  return resolved;
}

async function readExport(relativePath: string) {
  return fs.readFile(await sourcePath(relativePath), "utf8");
}

function matchesQuery(values: Array<string | undefined>, query: string) {
  if (!query) return true;
  const haystack = values.filter(Boolean).join(" ").toLocaleLowerCase();
  return haystack.includes(query.toLocaleLowerCase());
}

function countMatches(html: string, pattern: RegExp) {
  return [...html.matchAll(pattern)].length;
}

function encodedId(relativePath: string) {
  return Buffer.from(relativePath).toString("base64url");
}

function decodedConversationPath(id: string) {
  try {
    const relativePath = Buffer.from(id, "base64url").toString("utf8");
    if (!/^your_instagram_activity\/messages\/(?:inbox|message_requests|broadcast)\/[\w.-]+\/message_\d+\.html$/.test(relativePath)) {
      throw new Error("Invalid conversation");
    }
    return relativePath;
  } catch {
    throw new Error("Invalid conversation");
  }
}

export async function listInstagramConversations(query = "") {
  const html = await readExport("your_instagram_activity/messages/chats.html");
  const conversations: InstagramConversation[] = [];
  const pattern = /<h2[^>]*>\s*<a\s+href="([^"]*your_instagram_activity\/messages\/(?:inbox|message_requests|broadcast)\/[^"/]+\/message_\d+\.html)"[^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(pattern)) {
    const title = decodeHtml(match[2]);
    if (matchesQuery([title], query)) conversations.push({ id: encodedId(match[1]), title: title || "Untitled conversation" });
  }
  return { total: conversations.length, items: conversations.slice(0, MAX_RECORDS) };
}

export async function getInstagramMessages(id: string) {
  const html = await readExport(decodedConversationPath(id));
  const title = decodeHtml(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? "Conversation");
  const messages: InstagramMessage[] = [];
  const pattern = /<h2[^>]*>([\s\S]*?)<\/h2>([\s\S]*?)<div class="_3-94 _a6-o">([\s\S]*?)<\/div>/gi;
  for (const match of html.matchAll(pattern)) {
    const sender = decodeHtml(match[1]);
    if (!sender || /^(Participants:|Group Invite Link:)/i.test(sender)) continue;
    const text = decodeHtml(match[2])
      .replace(/^(?:[\w.-]+\s+)?reacted\s+.+?\s+to your message$/i, "Reacted to a message")
      .slice(0, 2_000);
    const timestamp = decodeHtml(match[3]);
    if (text) messages.push({ sender, text, timestamp });
    if (messages.length >= MAX_MESSAGES) break;
  }
  return { title, messages };
}

async function externalLinks(relativePath: string, query = "") {
  const filePath = await sourcePath(relativePath);
  const items: InstagramRecord[] = [];
  let count = 0;
  let carry = "";
  const urlPattern = /href="(https?:\/\/[^"\s]+)"/gi;

  // Liked posts is 171 MB. Stream it so opening the archive never needs to hold
  // that private history in memory.
  for await (const chunk of createReadStream(filePath, { encoding: "utf8" })) {
    const text = carry + chunk;
    for (const match of text.matchAll(urlPattern)) {
      // The carry is only for a URL split across two chunks. Do not count a
      // complete URL twice when it appeared at the end of the prior chunk.
      if ((match.index ?? 0) + match[0].length <= carry.length) continue;
      const url = decodeHtml(match[1]);
      const title = url.replace(/^https:\/\/www\.instagram\.com\/(?:_u\/)?/, "").replace(/\/$/, "");
      if (matchesQuery([title, url], query)) {
        count += 1;
        if (items.length < MAX_RECORDS) items.push({ title, url });
      } else if (!query) {
        count += 1;
      }
    }
    carry = text.slice(-300);
  }
  return { total: count, items };
}

async function linkHistoryRecords(query = "") {
  const html = await readExport("logged_information/link_history/link_history.html");
  const items: InstagramRecord[] = [];
  const pattern = />Website link you visited<\/td><td[^>]*>([\s\S]*?)<\/td>[\s\S]*?>Title of website page you visited<\/td><td[^>]*>([\s\S]*?)<\/td>[\s\S]*?<div class="_3-94 _a6-o">([\s\S]*?)<\/div>/gi;
  for (const match of html.matchAll(pattern)) {
    const url = decodeHtml(match[1]);
    const title = decodeHtml(match[2]) || url;
    const timestamp = decodeHtml(match[3]);
    if (url && matchesQuery([title, url], query)) items.push({ title, url, timestamp: timestamp || undefined });
  }
  return { total: items.length, items: items.slice(0, MAX_RECORDS) };
}

async function headingRecords(relativePath: string, query = "") {
  const html = await readExport(relativePath);
  const records: InstagramRecord[] = [];
  const headingPattern = /<h2[^>]*>([\s\S]*?)<\/h2>([\s\S]*?)(?=<h2|<\/main>)/gi;
  for (const match of html.matchAll(headingPattern)) {
    const title = decodeHtml(match[1]);
    const body = match[2];
    const url = decodeHtml(body.match(/href="(https:\/\/www\.instagram\.com\/[^"\s]+)"/i)?.[1] ?? "");
    const timestamp = decodeHtml(body.match(/>([A-Z][a-z]{2}\s+\d{1,2},\s+\d{4}[^<]*)</)?.[1] ?? "");
    if (title && matchesQuery([title, url], query)) records.push({ title, url: url || undefined, timestamp: timestamp || undefined });
  }
  return { total: records.length, items: records.slice(0, MAX_RECORDS) };
}

export async function listInstagramRecords(kind: InstagramRecordKind, query = "") {
  switch (kind) {
    case "liked":
      return externalLinks("your_instagram_activity/likes/liked_posts.html", query);
    case "saved":
      return externalLinks("your_instagram_activity/saved/saved_posts.html", query);
    case "searches":
      return headingRecords("logged_information/recent_searches/profile_searches.html", query);
    case "links":
      return linkHistoryRecords(query);
    case "followers":
      return externalLinks("connections/followers_and_following/followers_1.html", query);
    case "following":
      return headingRecords("connections/followers_and_following/following.html", query);
  }
}

export async function listInstagramPosts() {
  const html = await readExport("your_instagram_activity/media/posts.html");
  const posts: InstagramPost[] = [];
  const blocks = html.split('<div class="pam _3-95 _2ph- _a6-g uiBoxWhite noborder">').slice(1);
  for (const block of blocks) {
    const mediaPath = block.match(/href="(media\/posts\/[^"?#]+)"/i)?.[1];
    if (!mediaPath) continue;
    const caption = decodeHtml(block.match(/>Caption<\/td><td[^>]*>([\s\S]*?)<\/td>/i)?.[1] ?? "");
    const timestamp = decodeHtml(block.match(/<div class="_3-94 _a6-o">([\s\S]*?)<\/div>/i)?.[1] ?? "");
    posts.push({ path: mediaPath, caption: caption || undefined, timestamp: timestamp || undefined });
  }
  return posts;
}

export async function getInstagramOverview(): Promise<InstagramOverview> {
  const root = await exportRoot();
  if (!root) return { available: false, counts: { conversations: null, posts: null, saved: null, liked: null, searches: null, links: null, followers: null, following: null } };

  const [chats, posts, searches, following, followers, links] = await Promise.all([
    readExport("your_instagram_activity/messages/chats.html"),
    readExport("your_instagram_activity/media/posts.html"),
    readExport("logged_information/recent_searches/profile_searches.html"),
    readExport("connections/followers_and_following/following.html"),
    readExport("connections/followers_and_following/followers_1.html"),
    readExport("logged_information/link_history/link_history.html"),
  ]);
  const generatedAt = chats.match(/<time[^>]+datetime="([^"]+)"/i)?.[1];
  return {
    available: true,
    exportGeneratedAt: generatedAt,
    counts: {
      conversations: countMatches(chats, /\/message_\d+\.html/g),
      posts: countMatches(posts, /href="media\/posts\//g),
      saved: null,
      liked: null,
      searches: countMatches(searches, /<h2[^>]*>/g),
      links: countMatches(links, />Website link you visited<\/td>/g),
      followers: countMatches(followers, /href="https:\/\/www\.instagram\.com\//g),
      following: countMatches(following, /<h2[^>]*>/g),
    },
  };
}

export async function readInstagramMedia(relativePath: string) {
  if (!/^media\/posts\/[\w.-]+\.(?:jpe?g|png|webp)$/i.test(relativePath)) throw new Error("Invalid media path");
  const filePath = await sourcePath(relativePath);
  const info = await fs.stat(filePath);
  if (!info.isFile() || info.size > 20 * 1024 * 1024) throw new Error("Media is unavailable");
  const extension = path.extname(filePath).toLocaleLowerCase();
  const type = extension === ".png" ? "image/png" : extension === ".webp" ? "image/webp" : "image/jpeg";
  return { bytes: await fs.readFile(filePath), type };
}

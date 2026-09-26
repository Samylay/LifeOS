import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lifeos-news-"));
process.env.LIFEOS_DB_PATH = path.join(directory, "test.db");
process.env.BRIEF_TZ = "Europe/Paris";
vi.mock("./feeds", () => ({ activeFeeds: () => [] }));
vi.mock("@/lib/claude-cli", () => ({ generateJson: vi.fn(async () => ({ newsletter: "Test publication", stories: [{ title: "A useful story", tldr: "A short summary", summary: "More context", score: 5, link: "https://example.com/story" }] })) }));
const { getDoc, setDoc, deleteDoc } = await import("@/lib/server-db");
const { runNews } = await import("./engine");
const { listIssues, getIssue } = await import("./issues");
const { notifyDailyNews } = await import("./notifications");
const { INBOX_COLLECTION, ISSUES_COLLECTION, EDITIONS_COLLECTION } = await import("./types");
const { todayInTz } = await import("@/lib/brief/tz");
const { generateJson } = await import("@/lib/claude-cli");
const now = new Date("2026-09-26T08:00:00Z");
const email = { id: "issue", from: "test@example.com", subject: "Full issue", text: "First story\n\nAnother story beyond the digest.\n" + "Complete content. ".repeat(1000), link: "https://example.com/issue", addedAt: "2026-09-26T07:00:00Z", receivedAt: "2026-09-26T07:00:00Z" };

beforeEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  deleteDoc("news_delivery", "daily");
  deleteDoc(INBOX_COLLECTION, email.id);
  deleteDoc(ISSUES_COLLECTION, email.id);
  deleteDoc(EDITIONS_COLLECTION, todayInTz().dateStr);
  deleteDoc(EDITIONS_COLLECTION, "2026-09-26");
  setDoc("users/local/settings", "notify", { tz: "Europe/Paris", quietStart: "23:00", quietEnd: "07:00", pushNormal: false });
});
afterAll(() => { vi.useRealTimers(); vi.unstubAllGlobals(); fs.rmSync(directory, { recursive: true, force: true }); });

describe("newsletter preservation and arrivals", () => {
  it("keeps every character after processing removes the inbox entry", async () => {
    setDoc(INBOX_COLLECTION, email.id, { ...email, addedAt: new Date().toISOString() });
    const edition = await runNews();
    expect(getDoc(INBOX_COLLECTION, email.id)).toBeNull();
    expect(getIssue(email.id)?.text).toBe(email.text);
    expect(edition.items[0].newsletterId).toBe(email.id);
    expect(listIssues()).toHaveLength(1);
    const refreshed = await runNews({ force: true });
    expect(refreshed.items[0].newsletterId).toBe(email.id);
  });

  it("folds a late arrival into an existing edition without losing feed stories", async () => {
    setDoc(EDITIONS_COLLECTION, todayInTz().dateStr, { date: todayInTz().dateStr, generatedAt: "earlier", items: [{ title: "Earlier article", source: "Feed", bucket: "tech", score: 5, link: "https://example.com/earlier", tldr: "Earlier", summary: "Earlier", french: false }] });
    setDoc(INBOX_COLLECTION, email.id, { ...email, addedAt: new Date().toISOString() });
    const edition = await runNews();
    expect(edition.items.map((item) => item.title)).toEqual(expect.arrayContaining(["Earlier article", "A useful story"]));
  });

  it("preserves full text when splitting fails", async () => {
    vi.mocked(generateJson).mockRejectedValueOnce(new Error("model unavailable"));
    setDoc(INBOX_COLLECTION, email.id, { ...email, addedAt: new Date().toISOString() });
    const edition = await runNews();
    expect(edition.items[0].degraded).toBe(true);
    expect(getIssue(email.id)?.text).toBe(email.text);
  });
});

describe("daily newsletter delivery", () => {
  it("sends once per local day and includes a link to News", async () => {
    setDoc(ISSUES_COLLECTION, email.id, email);
    const fetcher = vi.fn(async (input: string, init?: RequestInit) => { void input; void init; return Response.json({ push: "delivered" }); });
    vi.stubGlobal("fetch", fetcher);
    await notifyDailyNews(now);
    await notifyDailyNews(now);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetcher.mock.calls[0][1]!.body as string)).toMatchObject({ stream: "news", path: "/news", severity: "normal" });
  });

  it("waits until morning and respects extended quiet hours", async () => {
    setDoc(ISSUES_COLLECTION, email.id, email);
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await notifyDailyNews(new Date("2026-09-26T05:00:00Z"));
    setDoc("users/local/settings", "notify", { tz: "Europe/Paris", quietStart: "23:00", quietEnd: "11:00" });
    await notifyDailyNews(now);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("retries failed push delivery without marking the day sent", async () => {
    setDoc(ISSUES_COLLECTION, email.id, email);
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ push: "error" })));
    await expect(notifyDailyNews(now)).rejects.toThrow("not delivered");
    expect(getDoc("news_delivery", "daily")).toBeNull();
    vi.stubGlobal("fetch", vi.fn(async (input: string, init?: RequestInit) => { void input; void init; return Response.json({ push: "delivered" }); }));
    await notifyDailyNews(now);
    expect(getDoc("news_delivery", "daily")?.date).toBe("2026-09-26");
  });
});


describe("full newsletter API", () => {
  it("returns complete text by id while the library response stays lightweight", async () => {
    setDoc(ISSUES_COLLECTION, email.id, email);
    const { GET: getLibrary } = await import("@/app/api/news/issues/route");
    const { GET: getFullIssue } = await import("@/app/api/news/issues/[id]/route");
    const library = await (await getLibrary()).json();
    expect(library.issues[0].text).toBeUndefined();
    expect(library.issues[0].preview.length).toBeLessThanOrEqual(180);
    const response = await getFullIssue(new Request("http://localhost"), { params: Promise.resolve({ id: email.id }) });
    expect((await response.json()).issue.text).toBe(email.text);
    const missing = await getFullIssue(new Request("http://localhost"), { params: Promise.resolve({ id: "missing" }) });
    expect(missing.status).toBe(404);
  });
});

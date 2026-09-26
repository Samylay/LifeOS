import { getDoc, setDoc } from "@/lib/server-db";
import { todayInTz } from "@/lib/brief/tz";
import { getNotifySettings, isQuietHours } from "@/lib/notify-gateway";
import { EDITIONS_COLLECTION, type Edition } from "./types";
import { listIssues } from "./issues";

const INTERNAL_ORIGIN = process.env.LIFEOS_INTERNAL_ORIGIN || "http://127.0.0.1:3000";
const STATE_COLLECTION = "news_delivery";

/** One daily reminder, after 08:00 and outside the user's quiet hours. */
export async function notifyDailyNews(now = new Date()): Promise<void> {
  const settings = getNotifySettings();
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: settings.tz, hour: "2-digit", hourCycle: "h23" }).format(now));
  if (hour < 8 || isQuietHours(now, settings)) return;
  const { dateStr } = todayInTz(settings.tz, now);
  const state = getDoc(STATE_COLLECTION, "daily");
  if (state?.date === dateStr) return;
  const cutoff = typeof state?.through === "string" ? state.through : new Date(now.getTime() - 86_400_000).toISOString();
  const issues = listIssues().filter((issue) => issue.addedAt > cutoff && issue.addedAt <= now.toISOString());
  const edition = getDoc(EDITIONS_COLLECTION, dateStr) as unknown as Edition | null;
  const sources = [...new Set(edition?.items.filter((item) => item.bucket === "news").map((item) => item.source) ?? [])];
  if (issues.length === 0 && sources.length === 0) return;
  const count = issues.length || sources.length;
  const response = await fetch(`${INTERNAL_ORIGIN}/api/notify`, {
    method: "POST",
    signal: AbortSignal.timeout(20_000),
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      title: "Your newsletters are ready",
      text: `${count} new newsletter${count === 1 ? "" : "s"}. Skim the digest or read the full issues in News.`,
      stream: "news",
      severity: "normal",
      source: "news",
      path: "/news",
    }),
  });
  if (!response.ok) throw new Error(`newsletter notification failed: HTTP ${response.status}`);
  const result = await response.json();
  if (result.push === "error" || result.push === "quiet" || result.deduped) {
    throw new Error(`newsletter push not delivered: ${result.push ?? "deduped"}`);
  }
  setDoc(STATE_COLLECTION, "daily", { date: dateStr, through: now.toISOString(), push: result.push });
}

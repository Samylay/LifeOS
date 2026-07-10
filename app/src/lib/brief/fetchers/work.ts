// Today's work — due/overdue Todoist tasks. This card drives the day.
//
// Needs TODOIST_API_TOKEN in the environment. No calendar source is wired
// (Google Calendar was disabled in the local-only conversion), so `events`
// stays empty until one exists.

import { card, type FetchResult } from "../registry";
import { BRIEF_TZ, todayInTz, localTimeToUtcIso } from "../tz";

// Unified API (rest/v2 returns 410 Gone since 2025).
const API_URL = "https://api.todoist.com/api/v1/tasks/filter";
const COMPLETED_URL = "https://api.todoist.com/api/v1/tasks/completed/by_completion_date";
const MAX_TASKS = 10;
const MAX_COMPLETED = 5;

// T31: the morning loop's feedback leg — what actually got DONE since
// yesterday 00:00 (BRIEF_TZ). Best-effort: any failure returns null and the
// card renders without the line; completions must never kill today's plan.
async function fetchCompletedYesterday(
  token: string
): Promise<{ count: number; items: string[] } | null> {
  try {
    const { dateStr } = todayInTz();
    const yesterday = new Date(Date.parse(`${dateStr}T00:00:00Z`) - 86_400_000)
      .toISOString()
      .slice(0, 10);
    const since = localTimeToUtcIso(yesterday, 0, 0, BRIEF_TZ);
    const until = new Date().toISOString().slice(0, 19) + "Z";
    const r = await globalThis.fetch(
      `${COMPLETED_URL}?since=${encodeURIComponent(since)}&until=${encodeURIComponent(until)}`,
      { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000) }
    );
    if (!r.ok) return null;
    const raw = (await r.json()) as { items?: { content?: string }[] };
    const items = (raw.items ?? []).map((t) => t.content || "").filter(Boolean);
    return { count: items.length, items: items.slice(0, MAX_COMPLETED) };
  } catch {
    return null;
  }
}

interface TodoistTask {
  id?: string;
  content?: string;
  due?: { date?: string } | null;
  priority?: number;
}

export async function fetch(): Promise<FetchResult> {
  const token = process.env.TODOIST_API_TOKEN;
  if (!token) throw new Error("TODOIST_API_TOKEN not set");

  const r = await globalThis.fetch(
    `${API_URL}?query=${encodeURIComponent("overdue | today")}&limit=${MAX_TASKS}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(20_000),
    },
  );
  if (!r.ok) throw new Error(`todoist ${r.status}`);
  const raw = (await r.json()) as { results: TodoistTask[] };

  const tasks = raw.results.slice(0, MAX_TASKS).map((t) => ({
    content: t.content || "",
    due: t.due?.date,
    priority: t.priority ?? 1,
    // v1 dropped the url field; the app URL is derived from the id.
    url: t.id ? `https://app.todoist.com/app/task/${t.id}` : undefined,
  }));
  // Todoist priority 4 = p1 (most urgent); show urgent first.
  tasks.sort((a, b) => (b.priority || 1) - (a.priority || 1));

  const completedYesterday = await fetchCompletedYesterday(token);

  return card({
    id: "work", type: "work", priority: "action", status: "neutral",
    title: "Today's work",
    body: { tasks, events: [], ...(completedYesterday ? { completed_yesterday: completedYesterday } : {}) },
  });
}

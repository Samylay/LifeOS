// Today's work — due/overdue Todoist tasks. This card drives the day.
//
// Needs TODOIST_API_TOKEN in the environment. No calendar source is wired
// (Google Calendar was disabled in the local-only conversion), so `events`
// stays empty until one exists.

import { card, type FetchResult } from "../registry";

const API_URL = "https://api.todoist.com/rest/v2/tasks";
const MAX_TASKS = 10;

interface TodoistTask {
  content?: string;
  due?: { date?: string } | null;
  priority?: number;
  url?: string;
}

export async function fetch(): Promise<FetchResult> {
  const token = process.env.TODOIST_API_TOKEN;
  if (!token) throw new Error("TODOIST_API_TOKEN not set");

  const r = await globalThis.fetch(`${API_URL}?filter=${encodeURIComponent("overdue | today")}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (!r.ok) throw new Error(`todoist ${r.status}`);
  const raw = (await r.json()) as TodoistTask[];

  const tasks = raw.slice(0, MAX_TASKS).map((t) => ({
    content: t.content || "",
    due: t.due?.date,
    priority: t.priority ?? 1,
    url: t.url,
  }));
  // Todoist priority 4 = p1 (most urgent); show urgent first.
  tasks.sort((a, b) => (b.priority || 1) - (a.priority || 1));

  return card({
    id: "work", type: "work", priority: "action", status: "neutral",
    title: "Today's work", body: { tasks, events: [] },
  });
}

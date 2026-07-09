// Pulls every open Todoist task (not just today/overdue, unlike
// fetchers/work.ts's brief card) and infers a daily-planning centre for
// each — see ~/loop-me/workflows/daily-planning.md "Todoist integration".
import { inferCentresCached, type CentreInference } from "../centre-inference";

const API_URL = "https://api.todoist.com/api/v1/tasks";

interface TodoistTask {
  id?: string;
  content?: string;
  description?: string;
}

export interface TodoistCentreTask extends CentreInference {
  id: string;
  content: string;
}

export async function fetchTodoistTasksWithCentres(): Promise<TodoistCentreTask[]> {
  const token = process.env.TODOIST_API_TOKEN;
  if (!token) throw new Error("TODOIST_API_TOKEN not set");

  const tasks: { id: string; content: string; description?: string }[] = [];
  let cursor: string | null = null;
  do {
    const url: string = cursor
      ? `${API_URL}?cursor=${encodeURIComponent(cursor)}`
      : API_URL;
    const r: Response = await globalThis.fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(20_000),
    });
    if (!r.ok) throw new Error(`todoist ${r.status}`);
    const page = (await r.json()) as { results: TodoistTask[]; next_cursor: string | null };
    for (const t of page.results) {
      if (!t.id || !t.content) continue;
      tasks.push({ id: t.id, content: t.content, description: t.description });
    }
    cursor = page.next_cursor;
  } while (cursor);

  const inferred = inferCentresCached(tasks);
  const byId = new Map(tasks.map((t) => [t.id, t.content]));
  return inferred.map((inf) => ({ ...inf, content: byId.get(inf.id) ?? "" }));
}

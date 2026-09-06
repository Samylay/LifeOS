// The one Todoist write client. Before this module, four call sites each
// built their own `fetch("https://api.todoist.com/...")` — teach.ts
// (T60 scheduleTopic), grilling.ts (enqueueGrillingTodo), and two read-only
// brief fetchers. Voice (ticket 03) needed a fifth write path; instead this
// extracts the one teach.ts and grilling.ts already agreed on (token from
// TODOIST_API_TOKEN, injectable transport, fail-soft on any error) so voice
// reuses it and the two existing writers were rebased onto it rather than
// forking further (spec.md: "voice does not introduce a Todoist integration").
//
// The read-only list fetchers (brief/fetchers/work.ts,
// brief/fetchers/todoist-centres.ts) are a different shape — paginated GET —
// and are left alone; nothing here changes what they do.

export type TodoistTransport = (url: string, init: RequestInit) => Promise<Response>;

export interface TodoistTaskInput {
  content: string;
  // Todoist's v1 API accepts either an ISO due_date or a natural-language
  // due_string ("Friday", "tomorrow") — callers pick whichever they have;
  // never both.
  due_date?: string;
  due_string?: string;
}

export interface TodoistWriteResult {
  ok: boolean;
  taskId?: string | null;
  error?: string;
}

const TASKS_URL = "https://api.todoist.com/api/v1/tasks";

/** Creates one Todoist task. Never throws — a missing token, a network
 * failure, or a non-2xx response all come back as `{ ok: false, error }` so
 * every caller can fail soft without its own try/catch. The transport is
 * injectable so tests never hit the wire. */
export async function createTodoistTask(
  input: TodoistTaskInput,
  opts: { transport?: TodoistTransport } = {}
): Promise<TodoistWriteResult> {
  const token = process.env.TODOIST_API_TOKEN;
  if (!token) {
    return { ok: false, error: "TODOIST_API_TOKEN not set" };
  }
  const transport = opts.transport ?? globalThis.fetch.bind(globalThis);
  try {
    const res = await transport(TASKS_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`todoist ${res.status}`);
    const created = (await res.json()) as { id?: string };
    return { ok: true, taskId: created.id ?? null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Deletes one Todoist task by id (T-voice-rework-05's "move" — retracting a
 * voice capture from the destination it left). Never throws, same fail-soft
 * shape as createTodoistTask; a 404 counts as success since the end state
 * (no task with this id) is what the caller wants either way. */
export async function deleteTodoistTask(
  taskId: string,
  opts: { transport?: TodoistTransport } = {}
): Promise<TodoistWriteResult> {
  const token = process.env.TODOIST_API_TOKEN;
  if (!token) {
    return { ok: false, error: "TODOIST_API_TOKEN not set" };
  }
  const transport = opts.transport ?? globalThis.fetch.bind(globalThis);
  try {
    const res = await transport(`${TASKS_URL}/${taskId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok && res.status !== 404) throw new Error(`todoist ${res.status}`);
    return { ok: true, taskId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

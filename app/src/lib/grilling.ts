import { localDayOf, type Goal } from "./types";

// T27 — goals→grilling pipeline plumbing. A goal flagged `needsGrilling` gets
// exactly ONE "Grilling session: <goal>" Todoist task (due today); the actual
// interactive session decomposes it into granular todos later. Until that
// happens the pipeline degrades gracefully to a pending reminder — never
// guilt-styled (STYLE.md principle 5).

const TODOIST_TASKS_URL = "https://api.todoist.com/api/v1/tasks";

export type GrillingTransport = (
  url: string,
  init: RequestInit
) => Promise<Response>;

/** "Grilling session: <goal title>". */
export function grillingTodoTitle(goal: Pick<Goal, "title">): string {
  return `Grilling session: ${goal.title}`;
}

/** Goals still waiting on their grilling session: flagged but never grilled. */
export function grillingTodosFor(goals: Goal[]): Goal[] {
  return goals.filter((g) => g.needsGrilling === true && !g.grilledAt);
}

/** Duplicate guard: enqueue at most once per goal (until re-flagged). */
export function shouldEnqueueGrilling(goal: Goal): boolean {
  return !!goal.needsGrilling && !goal.grilledAt && !goal.grillingQueuedAt;
}

/** Exact JSON body POSTed to Todoist — due today (local civil day). */
export function grillingTodoBody(
  goal: Pick<Goal, "title">,
  now: Date = new Date()
): { content: string; due_date: string } {
  return { content: grillingTodoTitle(goal), due_date: localDayOf(now) };
}

/**
 * POSTs ONE Todoist task for this goal using the same client pattern as
 * T60 `scheduleTopic`'s `writeTodoistTask`. Fail soft by contract: on any
 * error (missing token, network, non-2xx) it returns `{ queued: false,
 * error }` WITHOUT throwing — local state stays consistent and the caller
 * can retry later. The transport is injectable so tests never hit the wire.
 */
export async function enqueueGrillingTodo(
  goal: Goal,
  opts: { transport?: GrillingTransport; now?: Date } = {}
): Promise<{ queued: boolean; taskId?: string | null; error?: string }> {
  if (!shouldEnqueueGrilling(goal)) {
    return { queued: false, error: "grilling todo already handled or not requested" };
  }
  const token = process.env.TODOIST_API_TOKEN;
  if (!token) {
    console.error("grilling: TODOIST_API_TOKEN not set — task not written, will retry");
    return { queued: false, error: "TODOIST_API_TOKEN not set" };
  }
  const transport = opts.transport ?? globalThis.fetch.bind(globalThis);
  try {
    const res = await transport(TODOIST_TASKS_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(grillingTodoBody(goal, opts.now)),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`todoist ${res.status}`);
    const created = (await res.json()) as { id?: string };
    return { queued: true, taskId: created.id ?? null };
  } catch (e) {
    console.error("grilling: Todoist task write failed, will retry", e);
    return { queued: false, error: e instanceof Error ? e.message : String(e) };
  }
}

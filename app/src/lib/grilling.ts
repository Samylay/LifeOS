import { localDayOf, type Goal } from "./types";
import { createTodoistTask, type TodoistTransport } from "./todoist-client";

// T27 — goals→grilling pipeline plumbing. A goal flagged `needsGrilling` gets
// exactly ONE "Grilling session: <goal>" Todoist task (due today); the actual
// interactive session decomposes it into granular todos later. Until that
// happens the pipeline degrades gracefully to a pending reminder — never
// guilt-styled (STYLE.md principle 5).
//
// The write itself goes through the shared client (todoist-client.ts) rather
// than its own fetch — see that module's header for why. `GrillingTransport`
// is kept as a named export (re-exporting the shared transport type) so
// existing test imports keep working.

export type GrillingTransport = TodoistTransport;

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
  const result = await createTodoistTask(grillingTodoBody(goal, opts.now), {
    transport: opts.transport,
  });
  if (!result.ok) {
    console.error("grilling: Todoist task write failed, will retry", result.error);
    return { queued: false, error: result.error };
  }
  return { queued: true, taskId: result.taskId };
}

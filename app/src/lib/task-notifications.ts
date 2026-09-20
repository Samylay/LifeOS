const SERVER_NOTIFY_URL = "http://127.0.0.1:3000/api/notify";

export function taskCompletionPayload(title: string) {
  return {
    title: "Task completed",
    text: `Completed: "${title}"`,
    stream: "alerts",
    severity: "normal",
    source: "lifeos.task-completion",
    path: "/",
  } as const;
}

/** Best-effort notification. Completion must remain successful if the pager is unavailable. */
export async function notifyTaskCompleted(
  title: string,
  transport: typeof fetch = fetch,
  url = typeof window === "undefined" ? SERVER_NOTIFY_URL : "/api/notify"
): Promise<void> {
  try {
    await transport(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(taskCompletionPayload(title)),
    });
  } catch {
    // Notifications must not block or roll back task completion.
  }
}

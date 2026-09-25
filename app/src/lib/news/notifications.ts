const INTERNAL_ORIGIN = process.env.LIFEOS_INTERNAL_ORIGIN || "http://127.0.0.1:3000";

/** Notify after an issue is stored in today's edition, so the link is ready. */
export async function notifyNewsletterArrival(sources: string[]): Promise<void> {
  if (sources.length === 0) return;

  const label = sources.length === 1 ? sources[0] : `${sources.length} newsletters`;
  const response = await fetch(`${INTERNAL_ORIGIN}/api/notify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      title: "New newsletter",
      text: `${label} is ready in News.`,
      stream: "news",
      severity: "normal",
      source: "news",
      path: "/news",
    }),
  });

  if (!response.ok) throw new Error(`newsletter notification failed: HTTP ${response.status}`);
}

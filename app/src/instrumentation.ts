// Next.js instrumentation hook — runs once per server process at boot.
// Starts the in-app morning-brief scheduler (daily 06:00 BRIEF_TZ + catch-up)
// and the news-aggregator scheduler (daily 04:00 BRIEF_TZ + catch-up).

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startBriefScheduler } = await import("@/lib/brief/scheduler");
    startBriefScheduler();
    const { startNewsScheduler } = await import("@/lib/news/scheduler");
    startNewsScheduler();
  }
}

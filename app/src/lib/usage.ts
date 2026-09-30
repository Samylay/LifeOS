import { getDoc, listDocs, runInTransaction, setDoc } from "@/lib/server-db";

// Per-day, per-route visit counts in `users/local/usage`. Counts only: no
// user, device or referrer. Exists so the next audit can read real usage
// instead of inferring it from what each surface happens to write.
const COLLECTION = "users/local/usage";

export function usageRoute(path: unknown): string | null {
  if (typeof path !== "string" || !path.startsWith("/") || path.length > 80) return null;
  const parts = path.split("?")[0].split("/").filter(Boolean).slice(0, 2);
  if (parts.some((part) => !/^[a-z0-9-]+$/.test(part))) return null;
  return "/" + parts.join("/");
}

export function usageDay(now = new Date(), timeZone = "Europe/Paris"): string {
  return now.toLocaleDateString("en-CA", { timeZone });
}

export function recordUsage(path: unknown, now = new Date()): boolean {
  const route = usageRoute(path);
  if (!route) return false;
  const day = usageDay(now);
  const id = `${day}${route.replace(/\//g, "_") || "_"}`;
  runInTransaction(() => {
    const count = Number(getDoc(COLLECTION, id)?.count ?? 0);
    setDoc(COLLECTION, id, { day, route, count: count + 1 });
  });
  return true;
}

export function usageSummary(days = 30, now = new Date()): { route: string; visits: number; days: number; last: string }[] {
  const since = usageDay(new Date(now.getTime() - days * 86_400_000));
  const byRoute = new Map<string, { visits: number; days: number; last: string }>();
  for (const doc of listDocs(COLLECTION)) {
    const day = String(doc.day), route = String(doc.route);
    if (day < since) continue;
    const entry = byRoute.get(route) ?? { visits: 0, days: 0, last: "" };
    entry.visits += Number(doc.count) || 0; entry.days += 1; if (day > entry.last) entry.last = day;
    byRoute.set(route, entry);
  }
  return [...byRoute].map(([route, value]) => ({ route, ...value })).sort((a, b) => b.visits - a.visits);
}

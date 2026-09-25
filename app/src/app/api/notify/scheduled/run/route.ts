import { NextResponse } from "next/server";
import { listDocs, runInTransaction, updateDoc } from "@/lib/server-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COLLECTION = "users/local/scheduledNotifications";
const CLAIM_TIMEOUT_MS = 5 * 60_000;

type ScheduledNotification = {
  id: string;
  text: string;
  title?: string;
  severity?: "high" | "normal" | "low";
  path?: string;
  status: string;
  scheduledAt: { __date: string };
  claimedAt?: { __date: string };
};

export async function POST() {
  const now = Date.now();
  const due = (listDocs(COLLECTION) as unknown as ScheduledNotification[])
    .filter((item) => {
      if (Date.parse(item.scheduledAt?.__date ?? "") > now) return false;
      if (item.status === "pending") return true;
      return item.status === "delivering" &&
        now - Date.parse(item.claimedAt?.__date ?? "") > CLAIM_TIMEOUT_MS;
    })
    .sort((a, b) => Date.parse(a.scheduledAt.__date) - Date.parse(b.scheduledAt.__date))
    .slice(0, 25);

  const claimed: ScheduledNotification[] = [];
  runInTransaction(() => {
    for (const item of due) {
      const current = listDocs(COLLECTION).find((candidate) => candidate.id === item.id) as
        | ScheduledNotification
        | undefined;
      const staleClaim = current?.status === "delivering" &&
        now - Date.parse(current.claimedAt?.__date ?? "") > CLAIM_TIMEOUT_MS;
      if (!current || (current.status !== "pending" && !staleClaim)) continue;
      updateDoc(COLLECTION, item.id, {
        status: "delivering",
        claimedAt: { __date: new Date(now).toISOString() },
      });
      claimed.push(item);
    }
  });

  let delivered = 0;
  for (const item of claimed) {
    try {
      const response = await fetch("http://127.0.0.1:3000/api/notify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          text: item.text,
          title: item.title,
          severity: item.severity ?? "normal",
          path: item.path,
          stream: "alerts",
          source: `scheduled:${item.id}`,
        }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) throw new Error(`notification gateway returned ${response.status}`);
      updateDoc(COLLECTION, item.id, {
        status: "delivered",
        deliveredAt: { __date: new Date().toISOString() },
      });
      delivered++;
    } catch (error) {
      updateDoc(COLLECTION, item.id, {
        status: "pending",
        lastError: error instanceof Error ? error.message : "delivery failed",
      });
    }
  }

  return NextResponse.json({ checked: due.length, delivered });
}

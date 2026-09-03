// Cards the /decide deck may show, oldest first (the same order the numbered
// brief-card replies resolve against): everything still proposed, plus
// deferred items whose defer date has come round. The rule itself is pure and
// tested in lib/decide/queue.ts.
import { NextResponse } from "next/server";
import { listDocs } from "@/lib/server-db";
import { visibleQueueItems, type QueueDoc } from "@/lib/decide/queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const all = listDocs("users/local/triageQueue", {
    where: [["status", "in", ["proposed", "deferred"]]],
  });
  const items = visibleQueueItems(all as (QueueDoc & { id: string })[], new Date());
  return NextResponse.json({ items });
}

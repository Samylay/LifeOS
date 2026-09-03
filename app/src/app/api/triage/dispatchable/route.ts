// Items Samy could hand to a Claude session: filed inside the dispatch window
// and not already queued (T-decide-rework-08). The window is deliberate — an
// unbounded "approved items" list is the holding pen this rework killed.
//
// Display fields only. The item's own text is shown so Samy has context while
// he writes the instruction; it is never what gets sent.
import { NextResponse } from "next/server";
import { listDocs } from "@/lib/server-db";
import { dispatchableItems, DISPATCH_WINDOW_DAYS, type QueueDoc } from "@/lib/decide/queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const filed = listDocs("users/local/triageQueue", {
    where: [["status", "==", "filed"]],
  }) as (QueueDoc & { id: string; url?: string; proposal?: { title?: string; summary?: string } })[];
  const queued = listDocs("users/local/promptQueue", {
    where: [["status", "==", "queued"]],
  });
  const items = dispatchableItems(
    filed,
    queued.map((q) => String(q.itemId ?? "")),
    new Date(),
  ).map((i) => ({
    id: i.id,
    url: i.url ?? "",
    title: i.proposal?.title ?? i.proposal?.summary ?? i.url ?? "",
    filedAt: i.filedAt,
    filedAs: (i as { filedAs?: string }).filedAs ?? "",
  }));
  return NextResponse.json({ items, windowDays: DISPATCH_WINDOW_DAYS });
}

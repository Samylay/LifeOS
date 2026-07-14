// One verdict on one proposed-drop from the bookmark-shelf deck.
//
// "drop" confirms the cull — the row is marked and the bookmark simply stays
// in Firefox, untouched. Nothing is deleted from the browser, ever: this deck
// decides what LifeOS pays attention to, not what Samy is allowed to keep.
//
// "keep" rescues it into the normal triage pipeline, where the nightly study
// step will fetch and assess it properly like any other saved URL.
import { NextRequest, NextResponse } from "next/server";
import { getDoc, updateDoc } from "@/lib/server-db";
import { enqueueTriageItem } from "@/lib/triage-ingest";
import { BACKFILL_COLLECTION } from "@/lib/bookmark-backfill";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIONS = ["drop", "keep"] as const;
type Action = (typeof ACTIONS)[number];

export async function POST(req: NextRequest) {
  let body: { id?: string; action?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!body.id || !ACTIONS.includes(body.action as Action)) {
    return NextResponse.json({ error: "id and a valid action required" }, { status: 400 });
  }

  const item = getDoc(BACKFILL_COLLECTION, body.id) as
    | { url: string; folder?: string; savedAt?: { __date?: string }; status: string }
    | null;
  if (!item) return NextResponse.json({ error: "no such item" }, { status: 404 });
  if (item.status !== "pending") {
    return NextResponse.json({ error: `item is ${item.status}, not pending` }, { status: 409 });
  }

  if (body.action === "drop") {
    updateDoc(BACKFILL_COLLECTION, body.id, { status: "dropped" });
    return NextResponse.json({ ok: true, result: "dropped" });
  }

  const { id: triageId, duplicate } = enqueueTriageItem({
    url: item.url,
    folder: item.folder,
    savedAt: item.savedAt?.__date,
  });
  // Remember what the rescue created so Undo can revert it exactly: a row we
  // enqueued is ours to remove, a row that already existed is not.
  updateDoc(BACKFILL_COLLECTION, body.id, {
    status: "kept",
    triageId,
    wasDuplicate: duplicate,
  });
  return NextResponse.json({
    ok: true,
    result: duplicate ? "already queued" : "kept — queued for study",
  });
}

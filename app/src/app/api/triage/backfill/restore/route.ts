// Undo one bookmark-shelf verdict (the deck's Undo toast).
//
// Unlike the /decide restore, this one CAN fully revert: a rescued bookmark's
// only side effect is the triageQueue row it enqueued, so we remove it and the
// slate is clean. Two guards keep that honest — we only delete a row we
// created (not one that already existed), and only while it is still
// "queued". Once the study step has spent an Opus call on it, the row has
// value of its own and stays.
import { NextRequest, NextResponse } from "next/server";
import { getDoc, updateDoc, deleteDoc } from "@/lib/server-db";
import { TRIAGE_COLLECTION } from "@/lib/triage-ingest";
import { BACKFILL_COLLECTION } from "@/lib/bookmark-backfill";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: { id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const item = getDoc(BACKFILL_COLLECTION, body.id) as
    | { status: string; triageId?: string; wasDuplicate?: boolean }
    | null;
  if (!item) return NextResponse.json({ error: "no such item" }, { status: 404 });
  if (item.status !== "dropped" && item.status !== "kept") {
    return NextResponse.json({ error: `item is ${item.status}, nothing to undo` }, { status: 409 });
  }

  if (item.status === "kept" && item.triageId && !item.wasDuplicate) {
    const queued = getDoc(TRIAGE_COLLECTION, item.triageId) as { status?: string } | null;
    if (queued?.status === "queued") deleteDoc(TRIAGE_COLLECTION, item.triageId);
  }

  updateDoc(BACKFILL_COLLECTION, body.id, {
    status: "pending",
    triageId: null,
    wasDuplicate: null,
  });
  return NextResponse.json({ ok: true });
}

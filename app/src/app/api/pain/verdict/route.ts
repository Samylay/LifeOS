// One verdict on one pain point.
//
// "drop" = not worth chasing. "keep" = worth chasing, which means worth
// TALKING TO THIS PERSON — the card carries their handle and a permalink for
// exactly that reason. Keeps stay in this collection (GET /api/pain?status=kept)
// rather than auto-filing anywhere: where a kept pain point should land is
// Samy's call, not one to invent here.
//
// Nothing is deleted either way. A dropped row is marked, not removed, so the
// read-through is resumable and Undo always has something to restore.
import { NextRequest, NextResponse } from "next/server";
import { getDoc, updateDoc } from "@/lib/server-db";
import { PAIN_COLLECTION } from "@/lib/pain-deck";

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

  const item = getDoc(PAIN_COLLECTION, body.id) as { status: string } | null;
  if (!item) return NextResponse.json({ error: "no such item" }, { status: 404 });
  if (item.status !== "pending") {
    return NextResponse.json({ error: `item is ${item.status}, not pending` }, { status: 409 });
  }

  const kept = body.action === "keep";
  updateDoc(PAIN_COLLECTION, body.id, {
    status: kept ? "kept" : "dropped",
    decidedAt: { __date: new Date().toISOString() },
  });
  return NextResponse.json({ ok: true, result: kept ? "kept — go talk to them" : "dropped" });
}

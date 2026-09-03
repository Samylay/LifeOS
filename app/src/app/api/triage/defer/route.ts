// "Not now" as a real verdict (T-decide-rework-06). The card leaves the deck
// and returns on a defined date rather than rotting in the queue or being
// discarded to get it off the screen. No filing side effect runs.
import { NextRequest, NextResponse } from "next/server";
import { getDoc, updateDoc } from "@/lib/server-db";
import { DEFER_DAYS, deferUntilFrom } from "@/lib/decide/queue";

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
  const item = getDoc("users/local/triageQueue", body.id);
  if (!item) return NextResponse.json({ error: "no such item" }, { status: 404 });
  if (item.status !== "proposed" && item.status !== "deferred") {
    return NextResponse.json({ error: `item is ${item.status}, not open` }, { status: 409 });
  }
  const until = deferUntilFrom(new Date());
  updateDoc("users/local/triageQueue", body.id, {
    status: "deferred",
    deferUntil: { __date: until },
    deferredAt: { __date: new Date().toISOString() },
  });
  return NextResponse.json({
    ok: true,
    result: `back in ${DEFER_DAYS} days`,
    deferUntil: until,
  });
}

// One swipe/button verdict on one triage item from the /decide deck.
import { NextRequest, NextResponse } from "next/server";
import { getDoc } from "@/lib/server-db";
import { applyActionToItem } from "@/lib/brief/triage-apply";
import type { TriageAction } from "@/lib/brief/triage-reply";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIONS: TriageAction[] = ["approve", "vault", "idea-bank", "backlog", "discard"];

export async function POST(req: NextRequest) {
  let body: { id?: string; action?: string; centre?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!body.id || !ACTIONS.includes(body.action as TriageAction)) {
    return NextResponse.json({ error: "id and a valid action required" }, { status: 400 });
  }
  const item = getDoc("users/local/triageQueue", body.id);
  if (!item) return NextResponse.json({ error: "no such item" }, { status: 404 });
  if (item.status !== "proposed") {
    return NextResponse.json({ error: `item is ${item.status}, not proposed` }, { status: 409 });
  }
  try {
    const result = applyActionToItem(item, body.action as TriageAction, body.centre ?? null);
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "apply failed" },
      { status: 500 }
    );
  }
}

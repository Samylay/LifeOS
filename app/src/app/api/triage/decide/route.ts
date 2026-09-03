// One verdict on one triage item from the /decide deck. The request carries an
// action id from the closed set plus that action's typed parameters, and
// nothing else — see parseActionRequest, which is the trust boundary: no text
// the caller sends can reach the effect, and the item's own text is read from
// the stored document rather than the request.
//
// Approving performs the action here and now (T-decide-rework-05). There is no
// holding pen: the response reports the concrete outcome, and a failed effect
// returns an error with the card left un-handled.
import { NextRequest, NextResponse } from "next/server";
import { getDoc } from "@/lib/server-db";
import { performAction } from "@/lib/brief/triage-apply";
import { parseActionRequest } from "@/lib/decide/actions";
import { isOpenForVerdict } from "@/lib/decide/queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const id = (body as { id?: unknown })?.id;
  if (typeof id !== "string" || !id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  const action = parseActionRequest(body);
  if (!action) {
    return NextResponse.json({ error: "not a performable action" }, { status: 400 });
  }
  const item = getDoc("users/local/triageQueue", id);
  if (!item) return NextResponse.json({ error: "no such item" }, { status: 404 });
  // Deferred items are back in the deck, so they take verdicts like any other
  // card. Anything already filed or discarded is a conflict.
  if (!isOpenForVerdict(item.status as string)) {
    return NextResponse.json({ error: `item is ${item.status}, not open` }, { status: 409 });
  }
  try {
    const result = performAction(item, action);
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "action failed" },
      { status: 500 }
    );
  }
}

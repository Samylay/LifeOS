// One verdict on one pain point.
//
// "drop" = not worth chasing. "keep" = worth chasing, which means worth
// TALKING TO THIS PERSON — so a keep files a lead (source "hn-pain") and the
// card shows up on /leads with the new→contacted→won/passed status Samy
// already drives there. Keeps deliberately do NOT just sit in this collection:
// a keep with no status is a shelf, and a shelf is how the last shortlist died.
//
// Nothing is deleted either way. A dropped row is marked, not removed, so the
// read-through is resumable and Undo always has something to restore.
import { NextRequest, NextResponse } from "next/server";
import { getDoc, updateDoc } from "@/lib/server-db";
import { enqueueLead } from "@/lib/leads-ingest";
import { PAIN_COLLECTION, isoOf, type PainItem } from "@/lib/pain-deck";

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

  const item = getDoc(PAIN_COLLECTION, body.id) as PainItem | null;
  if (!item) return NextResponse.json({ error: "no such item" }, { status: 404 });
  if (item.status !== "pending") {
    return NextResponse.json({ error: `item is ${item.status}, not pending` }, { status: 409 });
  }

  if (body.action === "drop") {
    updateDoc(PAIN_COLLECTION, body.id, {
      status: "dropped",
      decidedAt: { __date: new Date().toISOString() },
    });
    return NextResponse.json({ ok: true, result: "dropped" });
  }

  const { id: leadId, duplicate } = enqueueLead({
    source: "hn-pain",
    extId: item.extId,
    // Who + where, so /leads is scannable without opening every card.
    title: [item.author, item.storyTitle].filter(Boolean).join(" — ").slice(0, 200),
    url: item.url,
    // No budget: they have a problem, they are not hiring. The blank pill on
    // /leads is the point — it's "would pay" vs "pays", visible at a glance.
    budget: "—",
    budgetFloor: 0,
    categories: item.phrase,
    brief: item.text,
    postedAt: isoOf(item.saidAt),
  });

  // Remember what the keep created so Undo can revert it exactly: a lead we
  // filed is ours to remove, one that already existed is not.
  updateDoc(PAIN_COLLECTION, body.id, {
    status: "kept",
    decidedAt: { __date: new Date().toISOString() },
    leadId,
    wasDuplicate: duplicate,
  });

  return NextResponse.json({
    ok: true,
    result: duplicate ? "already on /leads" : "kept — on /leads, go talk to them",
  });
}

// Bookmark-shelf backfill pre-stage: seed (POST) + deck feed (GET).
//
// `~/services/triage/backfill-firefox.py` POSTs one row per bookmark it wants
// to DROP. Its keeps never come here — they go straight to /api/triage/ingest
// and follow the normal study → /decide path.
import { NextRequest, NextResponse } from "next/server";
import { listDocs, createDoc } from "@/lib/server-db";
import { canonicalizeUrl } from "@/lib/triage";
import { BACKFILL_COLLECTION } from "@/lib/bookmark-backfill";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Pending proposed-drops, oldest bookmark first — the shelf's back gets cleared
 *  first, which is where the obvious junk lives. */
export async function GET() {
  const items = listDocs(BACKFILL_COLLECTION, {
    where: [["status", "==", "pending"]],
    orderBy: ["savedAt", "asc"],
  });
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  let body: {
    url?: string;
    title?: string;
    folder?: string;
    savedAt?: string;
    alive?: boolean;
    httpStatus?: number;
    why?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!body.url || typeof body.url !== "string") {
    return NextResponse.json({ error: "url required" }, { status: 400 });
  }

  const url = canonicalizeUrl(body.url);
  // Same dedup contract as ingest: re-running the backfill must not stack
  // duplicate cards onto the deck.
  const existing = listDocs(BACKFILL_COLLECTION, { where: [["url", "==", url]] });
  if (existing.length > 0) {
    return NextResponse.json({ ok: true, duplicate: true, id: existing[0].id });
  }

  const savedAt =
    body.savedAt && !Number.isNaN(Date.parse(body.savedAt))
      ? new Date(body.savedAt)
      : new Date();

  const id = createDoc(BACKFILL_COLLECTION, {
    url,
    title: (body.title ?? "").slice(0, 200),
    folder: (body.folder ?? "").slice(0, 80),
    savedAt: { __date: savedAt.toISOString() },
    alive: body.alive !== false,
    httpStatus: typeof body.httpStatus === "number" ? body.httpStatus : 0,
    verdict: "drop",
    why: (body.why ?? "").slice(0, 300),
    status: "pending",
    createdAt: { __date: new Date().toISOString() },
  });

  return NextResponse.json({ ok: true, duplicate: false, id });
}

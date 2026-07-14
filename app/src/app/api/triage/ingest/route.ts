// T33 — bookmark-triage ingest. The grabbers (~/services/triage, T34) POST
// each captured bookmark/save URL here; the nightly study step (T35) reads
// status:"queued" rows. Dedup is by canonical URL so the same tweet/reel
// captured twice (or re-seen on the next grabber run) inserts once.
//
// The enqueue itself lives in lib/triage-ingest.ts, shared with the backfill
// deck's rescue path.
import { NextRequest, NextResponse } from "next/server";
import { enqueueTriageItem } from "@/lib/triage-ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: { url?: string; source?: string; savedAt?: string; folder?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!body.url || typeof body.url !== "string") {
    return NextResponse.json({ error: "url required" }, { status: 400 });
  }

  const { id, duplicate, source } = enqueueTriageItem({
    url: body.url,
    source: body.source,
    savedAt: body.savedAt,
    folder: body.folder,
  });

  return duplicate
    ? NextResponse.json({ ok: true, duplicate: true, id })
    : NextResponse.json({ ok: true, duplicate: false, id, source });
}

// T33 — bookmark-triage ingest. The grabbers (~/services/triage, T34) POST
// each captured bookmark/save URL here; the nightly study step (T35) reads
// status:"queued" rows. Dedup is by canonical URL so the same tweet/reel
// captured twice (or re-seen on the next grabber run) inserts once.
import { NextRequest, NextResponse } from "next/server";
import { listDocs, createDoc } from "@/lib/server-db";
import { canonicalizeUrl, inferSource, type TriageSource } from "@/lib/triage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COLLECTION = "users/local/triageQueue";
const VALID_SOURCES: TriageSource[] = ["x", "instagram", "other"];

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

  const url = canonicalizeUrl(body.url);
  const source: TriageSource =
    body.source && VALID_SOURCES.includes(body.source as TriageSource)
      ? (body.source as TriageSource)
      : inferSource(url);

  // Dedup against the canonical url. The queue is small (a day's captures),
  // so a filtered list scan per ingest is fine.
  const existing = listDocs(COLLECTION, { where: [["url", "==", url]] });
  if (existing.length > 0) {
    return NextResponse.json({ ok: true, duplicate: true, id: existing[0].id });
  }

  const savedAt = body.savedAt && !Number.isNaN(Date.parse(body.savedAt))
    ? new Date(body.savedAt)
    : new Date();

  const folder = typeof body.folder === "string" ? body.folder.trim().slice(0, 80) : "";

  const id = createDoc(COLLECTION, {
    url,
    rawUrl: body.url,
    source,
    savedAt: { __date: savedAt.toISOString() },
    status: "queued",
    createdAt: { __date: new Date().toISOString() },
    ...(folder ? { folder } : {}),
  });

  return NextResponse.json({ ok: true, duplicate: false, id, source });
}

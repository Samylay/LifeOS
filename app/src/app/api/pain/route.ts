// Pain deck: seed (POST) + deck feed (GET).
//
// The seeder POSTs one row per pulled comment, verbatim. Nothing here fetches,
// scores, or summarises — see lib/pain-deck.ts for why that is the point.
import { NextRequest, NextResponse } from "next/server";
import { listDocs, createDoc } from "@/lib/server-db";
import { PAIN_COLLECTION, painKey, type PainQuote, type PainStatus } from "@/lib/pain-deck";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES: PainStatus[] = ["pending", "kept", "dropped"];

/** Deck feed. Insertion order = the phrase groups the pull arrived in, so the
 *  read-through stays inside one phrase at a time instead of thrashing. */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("status") ?? "pending";
  const status = (STATUSES as string[]).includes(q) ? q : "pending";
  const items = listDocs(PAIN_COLLECTION, {
    where: [["status", "==", status]],
    orderBy: ["createdAt", "asc"],
  });
  return NextResponse.json({ items });
}

function quotes(v: unknown): PainQuote[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((q): q is Record<string, unknown> => !!q && typeof q === "object")
    .map((q) => ({
      by: String(q.by ?? "?").slice(0, 80),
      text: String(q.text ?? "").slice(0, 2000),
      url: String(q.url ?? ""),
    }))
    .filter((q) => q.text.length > 0);
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const source = String(body.source ?? "hn");
  const extId = String(body.extId ?? "");
  const text = String(body.text ?? "");
  if (!extId) return NextResponse.json({ error: "extId required" }, { status: 400 });
  if (!text.trim()) return NextResponse.json({ error: "text required" }, { status: 400 });

  const key = painKey(source, extId);
  const existing = listDocs(PAIN_COLLECTION, { where: [["key", "==", key]] });
  if (existing.length > 0) {
    return NextResponse.json({ ok: true, duplicate: true, id: existing[0].id });
  }

  const saidAtRaw = String(body.saidAt ?? "");
  const saidAt =
    saidAtRaw && !Number.isNaN(Date.parse(saidAtRaw)) ? new Date(saidAtRaw) : new Date();

  const id = createDoc(PAIN_COLLECTION, {
    key,
    source,
    extId,
    url: String(body.url ?? ""),
    author: String(body.author ?? "?").slice(0, 80),
    saidAt: { __date: saidAt.toISOString() },
    // Deliberately not clamped: a truncated pain point is a misleading one.
    text,
    phrase: String(body.phrase ?? "").slice(0, 120),
    storyTitle: String(body.storyTitle ?? "").slice(0, 300),
    storyUrl: String(body.storyUrl ?? ""),
    storyText: String(body.storyText ?? "").slice(0, 2000),
    ancestors: quotes(body.ancestors),
    replies: quotes(body.replies),
    status: "pending",
    createdAt: { __date: new Date().toISOString() },
  });

  return NextResponse.json({ ok: true, duplicate: false, id });
}

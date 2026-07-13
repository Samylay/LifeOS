// Feed CRUD for the /news manager. GET seeds defaults on first read.
//   GET                        → { feeds }
//   POST   { name, url, ... }  → { id }
//   PATCH  { id, ...patch }    → { ok }
//   DELETE { id }              → { ok }
import { NextRequest, NextResponse } from "next/server";
import { listFeeds, addFeed, updateFeed, removeFeed } from "@/lib/news/feeds";
import type { Bucket } from "@/lib/news/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ feeds: listFeeds() });
}

export async function POST(req: NextRequest) {
  try {
    const b = await req.json();
    const id = addFeed({ name: b.name, url: b.url, bucket: b.bucket as Bucket, french: b.french });
    return NextResponse.json({ id });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "bad request" }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  const { id, ...patch } = await req.json();
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  updateFeed(id, patch);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  removeFeed(id);
  return NextResponse.json({ ok: true });
}

import { NextRequest, NextResponse } from "next/server";
import {
  getInstagramMessages,
  getInstagramOverview,
  listInstagramConversations,
  listInstagramPosts,
  listInstagramRecords,
  readInstagramMedia,
  type InstagramRecordKind,
} from "@/lib/instagram-export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RECORD_KINDS = new Set<InstagramRecordKind>(["saved", "liked", "searches", "links", "followers", "following"]);

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const view = searchParams.get("view") ?? "overview";
  const query = (searchParams.get("q") ?? "").slice(0, 120);

  try {
    if (view === "overview") return NextResponse.json(await getInstagramOverview(), { headers: { "Cache-Control": "no-store" } });
    if (view === "conversations") return NextResponse.json(await listInstagramConversations(query), { headers: { "Cache-Control": "no-store" } });
    if (view === "conversation") return NextResponse.json(await getInstagramMessages(searchParams.get("id") ?? ""), { headers: { "Cache-Control": "no-store" } });
    if (view === "posts") return NextResponse.json({ items: await listInstagramPosts() }, { headers: { "Cache-Control": "no-store" } });
    if (view === "records") {
      const kind = searchParams.get("kind") as InstagramRecordKind;
      if (!RECORD_KINDS.has(kind)) return NextResponse.json({ error: "Unknown record type" }, { status: 400 });
      return NextResponse.json(await listInstagramRecords(kind, query), { headers: { "Cache-Control": "no-store" } });
    }
    if (view === "media") {
      const media = await readInstagramMedia(searchParams.get("path") ?? "");
      return new NextResponse(media.bytes, { headers: { "Content-Type": media.type, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
    }
    return NextResponse.json({ error: "Unknown view" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Instagram export unavailable";
    return NextResponse.json({ error: message }, { status: message === "Instagram export is not mounted" ? 503 : 400 });
  }
}

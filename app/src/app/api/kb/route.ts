import { NextRequest, NextResponse } from "next/server";
import { kbEnabled, listNotes, createNote } from "@/lib/kb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!kbEnabled()) {
    return NextResponse.json({ enabled: false, notes: [] });
  }
  const q = req.nextUrl.searchParams.get("q") || undefined;
  const notes = listNotes(q);
  return NextResponse.json({ enabled: true, notes });
}

export async function POST(req: NextRequest) {
  if (!kbEnabled()) {
    return NextResponse.json({ error: "knowledge base not configured" }, { status: 503 });
  }
  try {
    const { title, content, folder } = await req.json();
    if (!title || typeof title !== "string" || !title.trim()) {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }
    const path = createNote({ title: title.trim(), content, folder });
    return NextResponse.json({ path });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "failed to create note" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { kbEnabled, readNote } from "@/lib/kb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!kbEnabled()) {
    return NextResponse.json({ error: "knowledge base not configured" }, { status: 503 });
  }
  const p = req.nextUrl.searchParams.get("path");
  if (!p) {
    return NextResponse.json({ error: "path is required" }, { status: 400 });
  }
  try {
    const note = readNote(p);
    if (!note) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ note });
  } catch {
    return NextResponse.json({ error: "invalid path" }, { status: 400 });
  }
}

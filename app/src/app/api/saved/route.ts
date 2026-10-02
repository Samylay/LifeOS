import { NextRequest, NextResponse } from "next/server";
import { savedLibrary } from "@/lib/saved-library";
export const dynamic = "force-dynamic";
export function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  return NextResponse.json(savedLibrary({ q: p.get("q") ?? undefined, field: p.get("field") ?? undefined, area: p.get("area") ?? undefined, page: Number(p.get("page") ?? 1) }));
}

import { NextRequest, NextResponse } from "next/server";
import { searchHomelabResources } from "@/lib/homelab-resources";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get("q") ?? "";
  return NextResponse.json({ items: searchHomelabResources(query) });
}

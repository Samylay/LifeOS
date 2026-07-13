// GET  → today's edition (cached; generates it if missing).
// POST → force a fresh regeneration (used by the "Refresh" button).
import { NextRequest, NextResponse } from "next/server";
import { runNews, latestEdition } from "@/lib/news/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  const edition = latestEdition() ?? (await runNews());
  return NextResponse.json({ edition });
}

export async function POST(_req: NextRequest) {
  const edition = await runNews({ force: true });
  return NextResponse.json({ edition });
}

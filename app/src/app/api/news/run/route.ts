// GET  → today's cached edition, or { edition: null } — NEVER generates.
//        Generation is a multi-minute LLM run; opening /news must not block on
//        it. The page shows a "Generate" CTA that POSTs instead.
// POST → force a fresh regeneration (fire-and-forget from the client).
import { NextRequest, NextResponse } from "next/server";
import { runNews, latestEdition } from "@/lib/news/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  return NextResponse.json({ edition: latestEdition() ?? null });
}

export async function POST(_req: NextRequest) {
  const edition = await runNews({ force: true });
  return NextResponse.json({ edition });
}

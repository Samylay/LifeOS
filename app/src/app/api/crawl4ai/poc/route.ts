import { NextRequest, NextResponse } from "next/server";
import { crawlHealth, crawlPresets, crawlPreview, type CrawlPreset } from "@/lib/crawl4ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const validPresets = new Set(crawlPresets().map((preset) => preset.id));

export async function GET() {
  return NextResponse.json({ health: await crawlHealth(), presets: crawlPresets(), readOnly: true });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const preset = typeof body.preset === "string" ? body.preset : "source";
    const url = typeof body.url === "string" ? body.url.trim() : "";
    if (!validPresets.has(preset)) return NextResponse.json({ error: "Unknown preset." }, { status: 400 });
    if (!url) return NextResponse.json({ error: "url is required" }, { status: 400 });
    return NextResponse.json({ result: await crawlPreview(preset as CrawlPreset, url) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid request." }, { status: 400 });
  }
}

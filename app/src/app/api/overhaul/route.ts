import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { join, basename } from "node:path";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Personal source material stays off the public repository. Existing app mount is read-only.
const ROOT = "/home/quorky/apps/lifeos/.scratch/visual-overhaul";
export async function GET(req: NextRequest) {
  try {
    const notebook = JSON.parse(await readFile(join(ROOT, "notes.json"), "utf8"));
    const imageId = req.nextUrl.searchParams.get("image");
    if (imageId) {
      const source = notebook.sources.find((s: { id: string }) => s.id === imageId);
      if (!source) return NextResponse.json({ error: "Image not found" }, { status: 404 });
      const image = await readFile(join(ROOT, "source-images", basename(source.local_path)));
      return new NextResponse(image, { headers: { "Content-Type": "image/jpeg", "X-Content-Type-Options": "nosniff", "Cache-Control": "private, max-age=3600" } });
    }
    const mapping = JSON.parse(await readFile(join(ROOT, "mapping.json"), "utf8"));
    return NextResponse.json({ sources: notebook.sources.map((s: { id: string; local_path: string }) => ({ id: s.id, name: basename(s.local_path), href: `/api/overhaul?image=${s.id}` })), items: notebook.items.map((item: { id: string }) => ({ ...item, mapping: mapping.items[item.id] })), topics: mapping.topics });
  } catch { return NextResponse.json({ error: "The private notebook review is not available on this installation." }, { status: 503 }); }
}

import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getRun } from "@/lib/workflows/store";
import { artifactDirectory } from "@/lib/workflows/artifacts";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest, context: { params: Promise<{ id: string; artifactId: string }> }) {
  try {
    const { id, artifactId } = await context.params;
    const artifact = getRun(id).artifacts.find((a) => a.id === artifactId);
    if (!artifact) return new NextResponse(null, { status: 404 });
    const bytes = await readFile(join(artifactDirectory(), id, artifact.id));
    const headers = { "Content-Type": artifact.mime, "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox", "Cache-Control": "private, max-age=3600", "Accept-Ranges": "bytes" };
    const range = req.headers.get("range");
    if (range) {
      const match = /^bytes=(\d+)-(\d*)$/.exec(range);
      const start = match ? Number(match[1]) : NaN;
      const end = match?.[2] ? Number(match[2]) : bytes.length - 1;
      if (!Number.isInteger(start) || start < 0 || start >= bytes.length || end < start || end >= bytes.length) return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${bytes.length}` } });
      return new NextResponse(bytes.subarray(start, end + 1), { status: 206, headers: { ...headers, "Content-Length": String(end - start + 1), "Content-Range": `bytes ${start}-${end}/${bytes.length}` } });
    }
    return new NextResponse(bytes, { headers: { ...headers, "Content-Length": String(bytes.length) } });
  } catch { return new NextResponse(null, { status: 404 }); }
}

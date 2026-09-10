import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { getAbTestContentDir } from "@/lib/abtest-design";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ path: string[] }> };

const MIME_TYPES: Record<string, string> = {
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

function error(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

function decodedSegments(segments: string[]): string[] | null {
  if (segments.length === 0) return null;
  const decoded: string[] = [];
  for (const segment of segments) {
    if (!segment || segment.includes("\0")) return null;
    let value: string;
    try {
      value = decodeURIComponent(segment);
    } catch {
      return null;
    }
    // A decoded separator would turn one route segment into another path.
    if (!value || value.includes("\0") || value.includes("/") || value.includes("\\")) {
      return null;
    }
    if (value === "." || value === "..") return null;
    decoded.push(value);
  }
  return decoded;
}

function contentTypeFor(relativePath: string): string | null {
  return MIME_TYPES[path.extname(relativePath).toLowerCase()] ?? null;
}

export async function GET(_request: Request, { params }: Context): Promise<NextResponse> {
  const { path: rawSegments } = await params;
  const segments = decodedSegments(rawSegments);
  if (!segments) return error("Invalid image path", 400);

  const relativePath = segments.join(path.sep);
  if (path.isAbsolute(relativePath) || /^[A-Za-z]:[\\/]/.test(relativePath)) {
    return error("Invalid image path", 400);
  }
  const contentType = contentTypeFor(relativePath);
  if (!contentType) return error("Unsupported image type", 400);

  try {
    const root = fs.realpathSync(getAbTestContentDir());
    const candidate = path.resolve(root, relativePath);
    const resolved = fs.realpathSync(candidate);
    const relativeToRoot = path.relative(root, resolved);
    if (
      !relativeToRoot ||
      relativeToRoot.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relativeToRoot)
    ) {
      return error("Invalid image path", 400);
    }

    const stats = fs.statSync(resolved);
    if (!stats.isFile()) return error("Image not found", 404);
    const body = fs.readFileSync(resolved);
    return new NextResponse(new Uint8Array(body), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return error("Image not found", 404);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { MAX_INBOX_PHOTO_BYTES, saveInboxPhoto } from "@/lib/photo-inbox";

export const runtime = "nodejs";
export async function POST(req: NextRequest) {
  try {
    if (Number(req.headers.get("content-length")) > MAX_INBOX_PHOTO_BYTES + 20000) return NextResponse.json({ error: "Photo is too large" }, { status: 413 });
    const form = await req.formData();
    const photo = form.get("photo");
    if (!(photo instanceof File) || photo.size > MAX_INBOX_PHOTO_BYTES) return NextResponse.json({ error: "Choose a photo up to 2.5 MB" }, { status: 400 });
    const result = saveInboxPhoto(Buffer.from(await photo.arrayBuffer()), photo.type, String(form.get("caption") || ""));
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save this photo" }, { status: 400 });
  }
}

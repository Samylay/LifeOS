import { after, NextRequest, NextResponse } from "next/server";
import { FoodError } from "@/lib/food-model";
import { MAX_PHOTO_BYTES, resumeFoodPhotos, saveFoodPhoto } from "@/lib/food-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(req: NextRequest) {
  try {
    if (Number(req.headers.get("content-length")) > MAX_PHOTO_BYTES + 20_000) throw new FoodError("Photo is too large", 413);
    const form = await req.formData();
    const file = form.get("photo");
    if (!(file instanceof File)) throw new FoodError("Choose a photo");
    if (file.size > MAX_PHOTO_BYTES) throw new FoodError("Photo is too large", 413);
    const photo = saveFoodPhoto({ id: String(form.get("id") || ""), sessionId: String(form.get("sessionId") || ""), caption: String(form.get("caption") || ""), eatenAt: String(form.get("eatenAt") || ""), timezone: String(form.get("timezone") || ""), mime: file.type, bytes: Buffer.from(await file.arrayBuffer()) });
    after(() => resumeFoodPhotos(photo.sessionId));
    return NextResponse.json({ photo }, { status: 202 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof FoodError ? error.message : "Couldn't save this photo. Try again." }, { status: error instanceof FoodError ? error.status : 500 });
  }
}

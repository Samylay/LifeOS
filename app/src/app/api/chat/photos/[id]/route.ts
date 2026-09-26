import { after, NextRequest, NextResponse } from "next/server";
import { correctFoodPhoto, getFoodPhoto, photoBytes, resumeFoodPhotos } from "@/lib/food-log";
import { FoodError } from "@/lib/food-model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function GET(_req: NextRequest, context: Context) {
  try {
    const { id } = await context.params;
    const photo = getFoodPhoto(id);
    return new NextResponse(new Uint8Array(photoBytes(id)), { headers: { "Content-Type": photo.mime, "X-Content-Type-Options": "nosniff", "Cache-Control": "private, max-age=86400" } });
  } catch (error) { return failure(error); }
}
export async function PATCH(req: NextRequest, context: Context) {
  try {
    const { id } = await context.params;
    const photo = correctFoodPhoto(id, await req.json());
    if (photo.state === "pending") after(() => resumeFoodPhotos(photo.sessionId));
    return NextResponse.json({ photo });
  } catch (error) { return failure(error); }
}
function failure(error: unknown) { return NextResponse.json({ error: error instanceof FoodError ? error.message : "Couldn't update this meal" }, { status: error instanceof FoodError ? error.status : 500 }); }

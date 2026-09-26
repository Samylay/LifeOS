import { after, NextRequest, NextResponse } from "next/server";
import { listDocs } from "@/lib/server-db";
import { listFoodPhotos, resumeFoodPhotos } from "@/lib/food-log";
import { validId } from "@/lib/food-model";
import { toMs } from "@/lib/teach";

export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("sessionId");
  if (!validId(sessionId)) return NextResponse.json({ error: "Invalid conversation id" }, { status: 400 });
  const messages = listDocs("users/local/chatMessages", { where: [["clientId", "==", sessionId]], orderBy: ["idx", "asc"] }).filter((m) => m.role === "user" || m.role === "assistant").map((m) => ({ id: m.id, role: m.role, content: m.text, actions: m.results, timestamp: new Date(toMs(m.createdAt) ?? Date.now()).toISOString() }));
  const photos = listFoodPhotos(sessionId);
  if (photos.some((p) => p.state === "pending" || p.state === "running")) after(() => resumeFoodPhotos(sessionId));
  return NextResponse.json({ messages, photos }, { headers: { "Cache-Control": "no-store" } });
}

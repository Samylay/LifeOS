import { NextResponse } from "next/server";
import { listCards } from "@/lib/feed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const cards = listCards().filter((card) => card.topicId === "abtest-design");
  return NextResponse.json({ cards });
}

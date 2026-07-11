// Proposed triage items for the /decide swipe deck, oldest first (the same
// order the numbered brief-card replies resolve against).
import { NextResponse } from "next/server";
import { listDocs } from "@/lib/server-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const items = listDocs("users/local/triageQueue", {
    where: [["status", "==", "proposed"]],
    orderBy: ["createdAt", "asc"],
  });
  return NextResponse.json({ items });
}

import { NextRequest, NextResponse } from "next/server";
import { resolve, shoppingErrorResponse } from "@/lib/shopping";

export const dynamic = "force-dynamic";

// What a word means in this pantry: the item that owns it as a name or alias,
// or the items it only resembles.
export async function GET(req: NextRequest) {
  try { return NextResponse.json(resolve(req.nextUrl.searchParams.get("term") ?? ""), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return shoppingErrorResponse(error); }
}

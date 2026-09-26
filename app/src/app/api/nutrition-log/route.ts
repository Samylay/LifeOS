import { NextRequest, NextResponse } from "next/server";
import { nutritionSummary } from "@/lib/food-log";
import { FoodError } from "@/lib/food-model";

export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  try { return NextResponse.json(nutritionSummary(req.nextUrl.searchParams.get("date") || undefined, req.nextUrl.searchParams.get("timezone") || undefined), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return NextResponse.json({ error: error instanceof FoodError ? error.message : "Invalid nutrition request" }, { status: error instanceof FoodError ? error.status : 400 }); }
}

import { NextRequest, NextResponse } from "next/server";
import { getNutritionSettings } from "@/lib/nutrition-settings";
import { verifyAuth, unauthorized } from "@/lib/verify-auth";

// Kcal/weight targets, previously hard-coded in nutrition-card.tsx.
export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth) return unauthorized();
  return NextResponse.json(getNutritionSettings());
}

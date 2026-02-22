import { NextRequest, NextResponse } from "next/server";
import { disconnectGarmin } from "@/lib/garmin-service";
import { verifyAuth, unauthorized } from "@/lib/verify-auth";

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth) return unauthorized();

  disconnectGarmin(auth.uid);
  return NextResponse.json({ connected: false });
}

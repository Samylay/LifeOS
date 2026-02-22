import { NextRequest, NextResponse } from "next/server";
import { getGarminStatus } from "@/lib/garmin-service";
import { verifyAuth, unauthorized } from "@/lib/verify-auth";

export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth) return unauthorized();

  const status = getGarminStatus(auth.uid);
  return NextResponse.json(status);
}

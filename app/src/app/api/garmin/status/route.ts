import { NextRequest, NextResponse } from "next/server";
import { getGarminStatus } from "@/lib/garmin-service";
import { verifyAuth } from "@/lib/api-auth";

export async function GET(req: NextRequest) {
  const authUser = await verifyAuth(req);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const status = getGarminStatus(authUser.uid);
  return NextResponse.json(status);
}

import { NextResponse } from "next/server";
import { getGarminStatus } from "@/lib/garmin-service";

export async function GET() {
  const status = getGarminStatus();
  return NextResponse.json(status);
}

import { NextResponse } from "next/server";
import { disconnectGarmin } from "@/lib/garmin-service";

export async function POST() {
  disconnectGarmin();
  return NextResponse.json({ connected: false });
}

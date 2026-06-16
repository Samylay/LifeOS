import { NextResponse } from "next/server";
import { getHealth, getHermesStatus } from "@/lib/system-health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const health = await getHealth();
  const hermes = getHermesStatus();
  return NextResponse.json({ health, hermes, now: Date.now() });
}

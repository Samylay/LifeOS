import { NextResponse } from "next/server";
import { getAllContainers, getHermesStatus } from "@/lib/system-health";
import { getHostMetrics } from "@/lib/metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const [containers, host] = await Promise.all([getAllContainers(), getHostMetrics()]);
  const hermes = getHermesStatus();
  return NextResponse.json({ containers, host, hermes, now: Date.now() });
}

import { NextResponse } from "next/server";
import { getSystemTopology } from "@/lib/system-health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const topology = await getSystemTopology();
  return NextResponse.json(topology, { status: topology.ok ? 200 : 503 });
}

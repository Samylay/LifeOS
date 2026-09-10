import { NextRequest, NextResponse } from "next/server";
import { connect } from "@/lib/fluency/provider";
export const runtime = "nodejs";
export async function POST(req: NextRequest) {
  try {
    const origin = req.headers.get("origin");
    if (origin && new URL(origin).host !== req.headers.get("host")) throw new Error("Request origin not allowed.");
    const b = await req.json();
    if (typeof b.key !== "string" || (b.agentId !== undefined && typeof b.agentId !== "string")) throw new Error("Enter a valid key and optional agent ID.");
    return NextResponse.json(await connect(b.key, b.agentId));
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Connection failed." }, { status: 400 }); }
}

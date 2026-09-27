import { NextResponse } from "next/server";
import { createApp, listApps } from "@/lib/micro/service";
import { body, failure } from "@/lib/micro/http";
export const dynamic = "force-dynamic";
export async function GET() {
  try { return NextResponse.json({ apps: listApps() }, { headers: { "cache-control": "no-store" } }); } catch (error) { return failure(error); }
}
export async function POST(req: Request) {
  try { return NextResponse.json({ app: createApp(await body(req)) }, { status: 201 }); } catch (error) { return failure(error); }
}

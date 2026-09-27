import { NextResponse } from "next/server";
import { readApp, saveApp } from "@/lib/micro/service";
import { body, failure } from "@/lib/micro/http";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function GET(_req: Request, context: Context) {
  try { return NextResponse.json({ app: readApp((await context.params).id) }, { headers: { "cache-control": "no-store" } }); } catch (error) { return failure(error); }
}
export async function PUT(req: Request, context: Context) {
  try { const v = await body(req); return NextResponse.json({ app: saveApp((await context.params).id, v.brief, v.revision) }); } catch (error) { return failure(error); }
}

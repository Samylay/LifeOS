import { NextRequest, NextResponse } from "next/server";
import { getDoc, runInTransaction, setDoc } from "@/lib/server-db";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const COLLECTION = "users/local/curricula";
const ID = "main";
function field(value: unknown, max: number) { if (typeof value !== "string" || value.length > max) throw new Error(`Text must be at most ${max} characters`); return value; }
export async function GET() { return NextResponse.json({ curriculum: getDoc(COLLECTION, ID) }); }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json(); const value = body.curriculum;
    if (!value || !Array.isArray(value.modules) || value.modules.length > 40) throw new Error("A curriculum supports up to 40 modules");
    const course = { title: field(value.title, 200), audience: field(value.audience, 2000), promise: field(value.promise, 3000), outcome: field(value.outcome, 3000), modules: value.modules.map((m: Record<string, unknown>) => ({ id: field(m.id, 60), title: field(m.title, 200), objective: field(m.objective, 3000), exercise: field(m.exercise, 6000), evidence: field(m.evidence, 3000), sources: field(m.sources, 6000) })) };
    const ids = course.modules.map((m: { id: string }) => m.id);
    if (new Set(ids).size !== ids.length) throw new Error("Module ids must be unique");
    const revision = runInTransaction(() => { const current = getDoc(COLLECTION, ID); if ((current?.revision ?? 0) !== body.revision) throw new Error("This course changed in another tab. Reload before saving."); const next = Number(current?.revision ?? 0) + 1; setDoc(COLLECTION, ID, { ...course, revision: next, updatedAt: new Date().toISOString() }); return next; });
    return NextResponse.json({ ok: true, revision });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save course" }, { status: 400 }); }
}

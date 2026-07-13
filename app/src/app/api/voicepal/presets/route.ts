// Transform presets: GET = list (seeds builtins); POST = create;
// PATCH = edit (the "Edit presets" affordance); DELETE = remove.
import { NextRequest, NextResponse } from "next/server";
import { createPreset, deletePreset, listPresets, updatePreset } from "@/lib/voicepal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ presets: listPresets() });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const name = String(body.name || "").trim();
    const instruction = String(body.instruction || "").trim();
    if (!name || !instruction) {
      return NextResponse.json({ error: "name and instruction required" }, { status: 400 });
    }
    return NextResponse.json({ id: createPreset(name, instruction) });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "create failed" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const id = String(body.id || "");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    updatePreset(id, { name: body.name, instruction: body.instruction });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "update failed" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = new URL(req.url).searchParams.get("id") || "";
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    deletePreset(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "delete failed" },
      { status: 500 }
    );
  }
}

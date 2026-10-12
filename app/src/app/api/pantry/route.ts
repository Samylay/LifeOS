import { NextRequest, NextResponse } from "next/server";
import { createPantryItem, deletePantryItem, listPantry, readJsonBody, shoppingErrorResponse, updatePantryItem } from "@/lib/shopping";

export const dynamic = "force-dynamic";

export async function GET() {
  try { return NextResponse.json({ pantry: listPantry() }, { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return shoppingErrorResponse(error); }
}

export async function POST(req: NextRequest) {
  try { return NextResponse.json({ item: createPantryItem(await readJsonBody(req)) }, { status: 201 }); }
  catch (error) { return shoppingErrorResponse(error); }
}

// Partial update by id: name, aliases, unit, category, inStock, quantity,
// minQuantity and nutrition.
export async function PATCH(req: NextRequest) {
  try {
    const { id, ...fields } = await readJsonBody(req);
    return NextResponse.json({ item: updatePantryItem(String(id ?? ""), fields) });
  } catch (error) { return shoppingErrorResponse(error); }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await readJsonBody(req);
    deletePantryItem(String(body.id ?? ""));
    return NextResponse.json({ ok: true });
  } catch (error) { return shoppingErrorResponse(error); }
}

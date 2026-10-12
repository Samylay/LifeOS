import { NextRequest, NextResponse } from "next/server";
import { addEntries, addLowStock, readJsonBody, removeEntry, setEntryChecked, shoppingErrorResponse, shoppingState } from "@/lib/shopping";
import { parseItems, ShoppingError, type Category, type ParsedLine } from "@/lib/shopping-model";

export const dynamic = "force-dynamic";

// The list and the pantry in one read, so the page renders both tabs at once.
export async function GET() {
  try { return NextResponse.json(shoppingState(), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return shoppingErrorResponse(error); }
}

// Add items. `text` is what the user typed or pasted ("2 item a, item b"),
// `items` is the structured form, and `lowStock: true` adds every low pantry item.
export async function POST(req: NextRequest) {
  try {
    const body = await readJsonBody(req);
    if (body.lowStock === true) return NextResponse.json({ added: addLowStock().map((entry) => ({ entry, said: entry.text, resolvedVia: "name", merged: false })) });
    let lines: ParsedLine[];
    if (typeof body.text === "string") lines = parseItems(body.text);
    else if (Array.isArray(body.items)) lines = body.items.map((raw) => {
      const item = (raw ?? {}) as Partial<ParsedLine>;
      return { name: item.name as string, quantity: item.quantity ?? null, unit: item.unit ?? null };
    });
    else throw new ShoppingError("Send text or items");
    return NextResponse.json({ added: addEntries(lines, "manual", body.category as Category | undefined) });
  } catch (error) { return shoppingErrorResponse(error); }
}

// Check or uncheck one entry.
export async function PATCH(req: NextRequest) {
  try {
    const body = await readJsonBody(req);
    return NextResponse.json({ entry: setEntryChecked(String(body.id ?? ""), body.checked) });
  } catch (error) { return shoppingErrorResponse(error); }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await readJsonBody(req);
    removeEntry(String(body.id ?? ""));
    return NextResponse.json({ ok: true });
  } catch (error) { return shoppingErrorResponse(error); }
}

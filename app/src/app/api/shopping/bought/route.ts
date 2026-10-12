import { NextRequest, NextResponse } from "next/server";
import { buyEntries, readJsonBody, shoppingErrorResponse, shoppingState } from "@/lib/shopping";
import { ShoppingError } from "@/lib/shopping-model";

export const dynamic = "force-dynamic";

// "Bought": moves entries into the pantry and off the list. Without `ids`,
// every checked entry is bought.
export async function POST(req: NextRequest) {
  try {
    const body = await readJsonBody(req);
    if (body.ids !== undefined && (!Array.isArray(body.ids) || body.ids.length > 200 || body.ids.some((id) => typeof id !== "string"))) {
      throw new ShoppingError("ids must be a list of entry ids");
    }
    const bought = buyEntries(body.ids as string[] | undefined);
    return NextResponse.json({ bought, ...shoppingState() });
  } catch (error) { return shoppingErrorResponse(error); }
}

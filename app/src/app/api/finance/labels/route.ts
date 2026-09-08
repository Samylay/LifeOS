import { NextResponse } from "next/server";
import { getFinanceOverview } from "@/lib/finance-overview";
import { clearMerchantLabel, saveMerchantLabel } from "@/lib/finance-labels-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function update(request: Request, clear: boolean) {
  const body = await request.json().catch(() => null);
  if (typeof body?.transactionId !== "string") return NextResponse.json({ error: "Choose a transaction." }, { status: 400 });
  const item = getFinanceOverview().activity.find((item) => item.transactionId === body.transactionId);
  if (!item) return NextResponse.json({ error: "Transaction not found in the current history." }, { status: 404 });
  try {
    if (clear) clearMerchantLabel(item.merchantKey);
    else {
      if (typeof body.label !== "string" || typeof body.category !== "string") throw new Error("Choose a name and category.");
      saveMerchantLabel(item.merchantKey, body.label, body.category);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save label." }, { status: 400 });
  }
}
export function POST(request: Request) { return update(request, false); }
export function DELETE(request: Request) { return update(request, true); }

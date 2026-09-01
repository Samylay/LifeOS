// Lists the banks (ASPSPs) Enable Banking can connect to, so /finance can offer
// a picker instead of hardcoding names that only Enable Banking knows.
import { NextRequest, NextResponse } from "next/server";
import { listAspsps, isEnableBankingConfigured } from "@/lib/enable-banking";

export async function GET(req: NextRequest) {
  if (!isEnableBankingConfigured()) {
    return NextResponse.json({ ok: false, aspsps: [] }, { status: 501 });
  }
  const country = req.nextUrl.searchParams.get("country") ?? "FR";
  const aspsps = await listAspsps(country);
  if (!aspsps) return NextResponse.json({ ok: false, aspsps: [] }, { status: 502 });
  return NextResponse.json({ ok: true, aspsps });
}

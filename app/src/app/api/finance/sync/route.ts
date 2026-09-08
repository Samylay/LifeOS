import { NextResponse } from "next/server";
import { requestBankSync } from "@/lib/bank-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const result = await requestBankSync();
    return NextResponse.json(result, { status: result.ok ? 200 : 502 });
  } catch {
    return NextResponse.json({ ok: false, reason: "Bank sync failed. Please retry." }, { status: 502 });
  }
}

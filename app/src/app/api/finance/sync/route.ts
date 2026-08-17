import { NextResponse } from "next/server";
import { syncBankTransactions } from "@/lib/bank-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const result = await syncBankTransactions();
  return NextResponse.json(result);
}

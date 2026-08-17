import { NextResponse } from "next/server";
import { isEnableBankingConfigured } from "@/lib/enable-banking";
import { listConnectedAccounts, listRecentBankTransactions } from "@/lib/bank-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Read-only summary for the /finance connected-accounts panel (T71). Never
// writes — syncing is still only POST /api/finance/sync.
export async function GET() {
  return NextResponse.json({
    configured: isEnableBankingConfigured(),
    accounts: listConnectedAccounts(),
    recentTransactions: listRecentBankTransactions(10),
  });
}

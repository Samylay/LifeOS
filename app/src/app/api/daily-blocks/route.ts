import { NextRequest, NextResponse } from "next/server";
import { getDailyBlocks, setDailyBlocks, BLOCKS_PER_DAY } from "@/lib/daily-blocks";
import { verifyAuth, unauthorized } from "@/lib/verify-auth";

// Manual tap counter for the plan's 4 daily eating blocks — not a food log.
export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth) return unauthorized();
  return NextResponse.json(getDailyBlocks());
}

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth) return unauthorized();

  const body = await req.json().catch(() => ({}));
  const blocksCompleted = Number(body.blocksCompleted);
  if (!Number.isFinite(blocksCompleted) || blocksCompleted < 0 || blocksCompleted > BLOCKS_PER_DAY) {
    return NextResponse.json({ error: "blocksCompleted must be 0-" + BLOCKS_PER_DAY }, { status: 400 });
  }
  return NextResponse.json(setDailyBlocks(blocksCompleted));
}

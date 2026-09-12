import { NextRequest, NextResponse } from "next/server";
import { validateEssayInput } from "@/lib/essay-review/model";
import { reviewEssay } from "@/lib/essay-review/review";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 240;

function sameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== req.headers.get("host")) throw new Error("Request origin not allowed.");
}

export async function POST(req: NextRequest) {
  try {
    sameOrigin(req);
    const input = validateEssayInput(await req.json());
    return NextResponse.json({ review: await reviewEssay(input) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The essay could not be reviewed.";
    const invalid = /Add an essay|at least 50 words|origin/i.test(message);
    return NextResponse.json({ error: message }, { status: invalid ? 400 : 502 });
  }
}

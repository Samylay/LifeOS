import { NextResponse } from "next/server";
import { listRecentCaptures } from "@/lib/voice-stash";

// The capture hub's "recent" list — the last several captures with the
// destination each landed in, so the surface can be trusted without opening
// anything (spec.md story 18, ticket 02). Reads the durable pending store
// (voice-stash.ts); no new collection, no capture-session model to sweep.
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ captures: listRecentCaptures() });
}

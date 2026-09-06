import { NextResponse } from "next/server";
import { listRecentCaptures, listRecoverableTakes } from "@/lib/voice-stash";

// The capture hub's "recent" list — the last several captures with the
// destination each landed in, so the surface can be trusted without opening
// anything (spec.md story 18, ticket 02). Reads the durable pending store
// (voice-stash.ts); no new collection, no capture-session model to sweep.
//
// T-voice-rework-05 adds `recoverable`: takes that never landed anywhere yet
// (transcription failed, or the review was abandoned before commit) —
// exactly the entries story 13/14's "every entry has an exit" rule requires
// the hub to surface, alongside the landed ones `captures` already reports.
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ captures: listRecentCaptures(), recoverable: listRecoverableTakes() });
}

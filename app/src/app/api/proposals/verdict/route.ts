// One verdict on one T58 proposal card.
//
// "accept" on a tag card adds it to the controlled topic-tag list; "accept"
// on a topic card creates a real TeachTopic — and REFUSES without a mission
// (map 06: a topic cannot exist without a why; addTopic throws, we surface
// that as 400 rather than catching it into a silent no-op).
// "never" tombstones the tag either way (map 11's only eligibility
// mechanism) — nothing else in this route infers intent from a swipe.
import { NextRequest, NextResponse } from "next/server";
import {
  acceptTagProposal,
  acceptTopicProposal,
  rejectTagProposal,
  rejectTopicProposal,
} from "@/lib/proposals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIONS = ["accept", "never"] as const;
type Action = (typeof ACTIONS)[number];

export async function POST(req: NextRequest) {
  let body: { id?: string; action?: string; mission?: string; topic?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!body.id || !ACTIONS.includes(body.action as Action)) {
    return NextResponse.json({ error: "id and a valid action required" }, { status: 400 });
  }

  const sep = body.id.indexOf(":");
  const kind = sep === -1 ? "" : body.id.slice(0, sep);
  const tag = sep === -1 ? "" : body.id.slice(sep + 1);
  if ((kind !== "tag" && kind !== "topic") || !tag) {
    return NextResponse.json({ error: "unrecognized proposal id" }, { status: 400 });
  }

  if (kind === "tag") {
    if (body.action === "accept") {
      acceptTagProposal(tag);
      return NextResponse.json({ ok: true, result: `tag "${tag}" added to the controlled list` });
    }
    rejectTagProposal(tag);
    return NextResponse.json({ ok: true, result: `"${tag}" tombstoned — never asked again` });
  }

  // kind === "topic"
  if (body.action === "accept") {
    if (!body.mission || !body.mission.trim()) {
      return NextResponse.json({ error: "mission is required" }, { status: 400 });
    }
    try {
      acceptTopicProposal(tag, body.mission, body.topic);
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 400 });
    }
    return NextResponse.json({ ok: true, result: `topic queued for "${tag}"` });
  }
  rejectTopicProposal(tag);
  return NextResponse.json({ ok: true, result: `"${tag}" tombstoned — never asked again` });
}

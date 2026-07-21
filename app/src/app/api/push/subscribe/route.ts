// Web-push subscription store (users/local/pushSubs).
//
//   GET             -> { subs: [{ id, endpoint, userAgent, createdAt }] }
//                      (keys are never returned to the client)
//   POST   { subscription, label? } -> store/upsert this browser's subscription
//   DELETE { endpoint }             -> remove a subscription
import { NextRequest, NextResponse } from "next/server";
import {
  listPushSubs,
  savePushSub,
  deletePushSubByEndpoint,
} from "@/lib/web-push-channel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const subs = listPushSubs().map((s) => ({
    id: s.id,
    endpoint: s.endpoint,
    userAgent: s.userAgent,
    createdAt: s.createdAt ?? null,
  }));
  return NextResponse.json({ subs });
}

export async function POST(req: NextRequest) {
  let body: {
    subscription?: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
    label?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const sub = body.subscription;
  if (
    !sub ||
    typeof sub.endpoint !== "string" ||
    !sub.endpoint ||
    typeof sub.keys?.p256dh !== "string" ||
    typeof sub.keys?.auth !== "string"
  ) {
    return NextResponse.json({ error: "subscription with endpoint + keys required" }, { status: 400 });
  }
  const id = savePushSub({
    endpoint: sub.endpoint,
    keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    userAgent: typeof body.label === "string" && body.label.trim() ? body.label.trim() : "unknown device",
  });
  return NextResponse.json({ id });
}

export async function DELETE(req: NextRequest) {
  let body: { endpoint?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (typeof body.endpoint !== "string" || !body.endpoint) {
    return NextResponse.json({ error: "endpoint required" }, { status: 400 });
  }
  const removed = deletePushSubByEndpoint(body.endpoint);
  return NextResponse.json({ removed });
}

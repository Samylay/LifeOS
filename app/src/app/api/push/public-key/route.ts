// Serve the VAPID public key to the browser for pushManager.subscribe().
// Generates the key pair on first call (stored in users/local/webPushConfig).
// The private key never leaves the server and is never logged.
import { NextResponse } from "next/server";
import { getOrCreateVapidKeys } from "@/lib/web-push-channel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { publicKey } = getOrCreateVapidKeys();
  return NextResponse.json({ publicKey });
}

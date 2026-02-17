import { NextRequest, NextResponse } from "next/server";
import { disconnectGarmin } from "@/lib/garmin-service";
import { verifyAuth } from "@/lib/api-auth";
import { getAdminDb } from "@/lib/firebase-admin";

export async function POST(req: NextRequest) {
  const authUser = await verifyAuth(req);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  disconnectGarmin(authUser.uid);

  // Clear connection metadata in Firestore
  try {
    const db = getAdminDb();
    await db
      .doc(`users/${authUser.uid}/settings/integrations`)
      .set(
        {
          garmin_connected: false,
          garmin_display_name: null,
          garmin_connected_at: null,
        },
        { merge: true }
      );
  } catch {
    // Non-fatal
  }

  return NextResponse.json({ connected: false });
}

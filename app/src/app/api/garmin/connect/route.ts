import { NextRequest, NextResponse } from "next/server";
import { connectGarmin } from "@/lib/garmin-service";
import { verifyAuth } from "@/lib/api-auth";
import { getAdminDb } from "@/lib/firebase-admin";

export async function POST(req: NextRequest) {
  const authUser = await verifyAuth(req);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    const result = await connectGarmin(authUser.uid, email, password);

    if (result.success) {
      // Persist connection metadata in Firestore (scoped to this user)
      try {
        const db = getAdminDb();
        await db
          .doc(`users/${authUser.uid}/settings/integrations`)
          .set(
            {
              garmin_connected: true,
              garmin_display_name: result.displayName || null,
              garmin_connected_at: new Date().toISOString(),
            },
            { merge: true }
          );
      } catch {
        // Non-fatal: connection works even if Firestore persistence fails
      }

      return NextResponse.json({
        connected: true,
        displayName: result.displayName,
      });
    }

    return NextResponse.json(
      { error: result.error || "Connection failed" },
      { status: 401 }
    );
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

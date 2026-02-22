// Server-side only — verifies Firebase ID tokens from API request headers
import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "./firebase-admin";

/**
 * Extract and verify the Firebase ID token from the Authorization header.
 * Returns the authenticated user's UID or null if verification fails.
 */
export async function verifyAuth(
  req: NextRequest
): Promise<{ uid: string } | null> {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;

  const idToken = header.slice(7);
  if (!idToken) return null;

  try {
    const decoded = await getAdminAuth().verifyIdToken(idToken);
    return { uid: decoded.uid };
  } catch {
    return null;
  }
}

/** Standard 401 response for unauthenticated requests. */
export function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

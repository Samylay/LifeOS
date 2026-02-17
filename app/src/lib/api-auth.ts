// Helper to verify Firebase auth in API routes
// Extracts and verifies the Bearer token from the Authorization header

import { NextRequest } from "next/server";
import { getAdminAuth } from "./firebase-admin";

export interface AuthResult {
  uid: string;
  email?: string;
}

/**
 * Verify the Firebase ID token from the request Authorization header.
 * Returns the user's uid and email, or null if unauthenticated.
 */
export async function verifyAuth(req: NextRequest): Promise<AuthResult | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  const idToken = authHeader.slice(7);
  if (!idToken) return null;

  try {
    const decoded = await getAdminAuth().verifyIdToken(idToken);
    return { uid: decoded.uid, email: decoded.email };
  } catch {
    return null;
  }
}

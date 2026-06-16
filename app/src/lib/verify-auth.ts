// Single-user self-hosted build: there is no external auth provider, so every
// request is treated as the local user. Kept as a module so the API routes
// that imported it keep working unchanged.
import { NextRequest, NextResponse } from "next/server";

export async function verifyAuth(
  _req: NextRequest
): Promise<{ uid: string } | null> {
  return { uid: "local" };
}

/** Standard 401 response (unused now, kept for compatibility). */
export function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

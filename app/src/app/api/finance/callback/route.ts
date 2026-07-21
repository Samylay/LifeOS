// Enable Banking redirect target — STUB (T67 prep; real wiring lands in T68/T69).
//
// The two URLs whitelisted at app registration (.scratch/finance-tracker/MAP.md Q4)
// point here:
//   https://homelab.tail069527.ts.net/api/finance/callback
//   http://127.0.0.1:3000/api/finance/callback
// The bank 302s Samy's BROWSER to this route with ?code=… after he authorizes
// account access; nothing fetches it server-side, so it only needs to exist so
// the whitelist doesn't point at a 404.
//
// T68 replaces this body: exchange the code via POST /sessions (through the
// src/lib/enable-banking.ts wrapper), persist the session in T69's
// bank_sessions table, then redirect to /finance. Until then the code is
// deliberately NOT consumed or logged — auth codes are single-use credentials.
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const hasCode = req.nextUrl.searchParams.has("code");
  return NextResponse.json(
    {
      ok: false,
      stub: true,
      message: hasCode
        ? "Bank authorization callback received, but the session exchange is not wired yet (T68/T69). The code was not consumed — re-run the flow once T68 lands."
        : "Enable Banking callback stub — nothing to do without a ?code parameter.",
    },
    { status: 501 }
  );
}

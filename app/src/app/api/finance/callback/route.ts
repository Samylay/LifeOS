// Enable Banking redirect target (T69 — wired; was a stub through T67 prep).
//
// The two URLs whitelisted at app registration (.scratch/finance-tracker/MAP.md Q4)
// point here:
//   https://homelab.tail069527.ts.net/api/finance/callback
//   http://127.0.0.1:3000/api/finance/callback
// The bank 302s Samy's BROWSER to this route with ?code=… after he authorizes
// account access; nothing fetches it server-side.
//
// Exchanges the code via POST /sessions (src/lib/enable-banking.ts), persists
// the session + linked accounts (src/lib/bank-db.ts), then redirects to
// /finance. The code is single-use — never logged, consumed exactly once.
import { NextRequest, NextResponse } from "next/server";
import { exchangeCode, isEnableBankingConfigured } from "@/lib/enable-banking";
import { saveBankSession } from "@/lib/bank-db";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.json(
      { ok: false, message: "Enable Banking callback — nothing to do without a ?code parameter." },
      { status: 400 }
    );
  }
  if (!isEnableBankingConfigured()) {
    return NextResponse.json(
      { ok: false, message: "Enable Banking is not configured (missing app id / private key)." },
      { status: 501 }
    );
  }

  const session = await exchangeCode(code);
  if (!session) {
    return NextResponse.json(
      { ok: false, message: "Session exchange failed — the code may be expired or already used." },
      { status: 502 }
    );
  }

  saveBankSession({
    sessionId: session.sessionId,
    accounts: session.accounts,
    accountsRaw: session.accountsRaw,
    aspspName: session.aspspName,
    aspspCountry: session.aspspCountry,
    validUntil: session.validUntil,
  });
  // req.url is the container-internal origin (0.0.0.0:3000) behind Tailscale
  // Serve, so send the browser back via the same public origin the consent
  // redirect came in on.
  const base = process.env.ENABLE_BANKING_REDIRECT_URL ?? req.url;
  return NextResponse.redirect(new URL("/finance?connected=1", base));
}

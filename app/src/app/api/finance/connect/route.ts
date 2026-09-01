// Starts the Enable Banking consent flow (the half that was missing until the
// first live link): asks Enable Banking for a bank-auth URL and 302s the
// browser to it. The bank then sends Samy back to /api/finance/callback?code=…
//
// Consent runs for the EEA maximum (180 days) — the expiry tripwire in
// bank-consent-notify.ts pages before it lapses.
import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { startAuth, isEnableBankingConfigured } from "@/lib/enable-banking";

const CONSENT_DAYS = 180;

export async function GET(req: NextRequest) {
  if (!isEnableBankingConfigured()) {
    return NextResponse.json(
      { ok: false, message: "Enable Banking is not configured (missing app id / private key)." },
      { status: 501 }
    );
  }

  const aspspName = req.nextUrl.searchParams.get("aspsp");
  const aspspCountry = req.nextUrl.searchParams.get("country") ?? "FR";
  if (!aspspName) {
    return NextResponse.json(
      { ok: false, message: "Missing ?aspsp — the bank name as Enable Banking spells it (see /api/finance/aspsps)." },
      { status: 400 }
    );
  }

  // Must exactly match a redirect URL whitelisted at app registration.
  const redirectUrl =
    process.env.ENABLE_BANKING_REDIRECT_URL ?? new URL("/api/finance/callback", req.url).toString();

  const validUntilIso = new Date(Date.now() + CONSENT_DAYS * 86_400_000).toISOString();
  const url = await startAuth({
    aspspName,
    aspspCountry,
    redirectUrl,
    state: crypto.randomUUID(),
    validUntilIso,
  });

  if (!url) {
    return NextResponse.json(
      { ok: false, message: "Enable Banking refused the auth request (check the bank name and the redirect URL)." },
      { status: 502 }
    );
  }
  return NextResponse.redirect(url);
}

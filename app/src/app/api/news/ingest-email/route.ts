// Ingest endpoint for the Cloudflare Email Worker (news@samylayaida.com).
// This is reachable from the public internet via the tunnel, so every request
// must carry a valid HMAC-SHA256 signature over the raw body, keyed by
// NEWS_INGEST_SECRET (shared with the worker). No secret configured → 503,
// so a misconfigured deploy fails closed instead of accepting anything.
//
// The signature only proves the worker forwarded the mail — not that the mail
// was wanted. The worker forwards ANYTHING addressed to news@, and the body
// reaches `claude -p` downstream, so the sender must also be on the approved
// list (NEWS_SENDER_ALLOWLIST). Both unset → 503; sender off it → 403.
import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createDoc } from "@/lib/server-db";
import { INBOX_COLLECTION } from "@/lib/news/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY = 512 * 1024; // newsletters are text; cap to avoid abuse

// Comma-separated. An entry with "@" matches that address exactly; otherwise
// it matches the domain and its subdomains, so `tldrnewsletter.com` covers
// `dailyupdate.tldrnewsletter.com` (TLDR sends from a per-issue local part —
// `0100019f…-000000@dailyupdate.tldrnewsletter.com` — so address-matching a
// newsletter is useless; match its domain).
function allowedSenders(): string[] {
  return (process.env.NEWS_SENDER_ALLOWLIST ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

// NOTE: this checks the envelope sender the worker reports. It stops the
// casual "anyone can mail news@ and reach the LLM" path; it is not proof of
// origin — that's Cloudflare's SPF/DKIM enforcement upstream. The prompts
// treat every email body as untrusted data regardless.
function senderAllowed(from: string, allow: string[]): boolean {
  const addr = from.toLowerCase().trim();
  const domain = addr.split("@").pop() ?? "";
  return allow.some((entry) =>
    entry.includes("@") ? addr === entry : domain === entry || domain.endsWith(`.${entry}`)
  );
}

function verify(raw: string, header: string | null, secret: string): boolean {
  if (!header) return false;
  const provided = header.startsWith("sha256=") ? header.slice(7) : header;
  const expected = createHmac("sha256", secret).update(raw).digest("hex");
  const a = Buffer.from(provided, "hex");
  const b = Buffer.from(expected, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  const secret = process.env.NEWS_INGEST_SECRET;
  const allow = allowedSenders();
  // Fail closed on both: an empty allowlist means "approve nobody", never
  // "approve everybody".
  if (!secret || allow.length === 0) {
    return NextResponse.json({ error: "ingest not configured" }, { status: 503 });
  }

  const raw = await req.text();
  if (raw.length > MAX_BODY) {
    return NextResponse.json({ error: "payload too large" }, { status: 413 });
  }
  if (!verify(raw, req.headers.get("x-signature"), secret)) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }

  let body: { from?: string; subject?: string; text?: string; link?: string; links?: string[]; receivedAt?: string };
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const from = String(body.from ?? "").slice(0, 320);
  const subject = String(body.subject ?? "").slice(0, 500);
  const text = String(body.text ?? "").slice(0, 200_000);
  if (!from || (!subject && !text)) {
    return NextResponse.json({ error: "empty email" }, { status: 400 });
  }
  if (!senderAllowed(from, allow)) {
    // Logged, not silent: a newsletter Samy subscribed to and never sees on
    // /news should be diagnosable without guessing.
    console.log(`[news-ingest] rejected sender not on allowlist: ${from}`);
    return NextResponse.json({ error: "sender not approved" }, { status: 403 });
  }

  const id = createDoc(INBOX_COLLECTION, {
    from,
    subject,
    text,
    link: String(body.link ?? "").slice(0, 2000) || `mailto:${from}`,
    links: Array.isArray(body.links) ? body.links.slice(0, 25).map((u) => String(u).slice(0, 2000)) : [],
    receivedAt: body.receivedAt || new Date().toISOString(),
    addedAt: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true, id });
}

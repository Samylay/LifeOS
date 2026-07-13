// Ingest endpoint for the Cloudflare Email Worker (news@samylayaida.com).
// This is reachable from the public internet via the tunnel, so every request
// must carry a valid HMAC-SHA256 signature over the raw body, keyed by
// NEWS_INGEST_SECRET (shared with the worker). No secret configured → 503,
// so a misconfigured deploy fails closed instead of accepting anything.
import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createDoc } from "@/lib/server-db";
import { INBOX_COLLECTION } from "@/lib/news/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY = 512 * 1024; // newsletters are text; cap to avoid abuse

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
  if (!secret) {
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

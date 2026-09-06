import { NextResponse } from "next/server";
import { setClassificationOverride, clearClassificationOverride } from "@/lib/finance-overrides-db";
import type { FlowKind } from "@/lib/finance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The one writable path in the finance vertical (ticket 04). Never accepts
// or reads any field but `merchantKey` and `kind` — there is no parameter
// position an amount, a label, a date or a cadence could occupy, so even a
// malicious or buggy body carrying an "amount" is silently ignored rather
// than written anywhere.
const VALID_KINDS: readonly FlowKind[] = ["fixed", "sub", "variable"];

function isValidKind(value: unknown): value is FlowKind {
  return typeof value === "string" && (VALID_KINDS as readonly string[]).includes(value);
}

function readMerchantKey(body: unknown): string | null {
  const key = (body as { merchantKey?: unknown } | null)?.merchantKey;
  const trimmed = typeof key === "string" ? key.trim() : "";
  return trimmed || null;
}

/** Sets (or replaces) the correction for one counterparty. Body: `{ merchantKey, kind }`. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const merchantKey = readMerchantKey(body);
  if (!merchantKey) {
    return NextResponse.json({ error: "merchantKey is required" }, { status: 400 });
  }
  const kind = (body as { kind?: unknown } | null)?.kind;
  if (!isValidKind(kind)) {
    return NextResponse.json({ error: "kind must be one of fixed, sub, variable" }, { status: 400 });
  }
  setClassificationOverride(merchantKey, kind);
  return NextResponse.json({ ok: true });
}

/** Clears the correction for one counterparty, returning it to the detected
 * classification. Body: `{ merchantKey }`. */
export async function DELETE(request: Request) {
  const body = await request.json().catch(() => null);
  const merchantKey = readMerchantKey(body);
  if (!merchantKey) {
    return NextResponse.json({ error: "merchantKey is required" }, { status: 400 });
  }
  clearClassificationOverride(merchantKey);
  return NextResponse.json({ ok: true });
}

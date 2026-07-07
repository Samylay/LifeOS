// Homelab pager ingest — the single entry point replacing the Telegram/n8n
// webhook. Stores every message in the local doc store (collection
// `users/local/notifications`, rendered by /pager) and forwards it to the
// self-hosted ntfy instance for phone push (best-effort: a dead ntfy must
// never lose the message or fail the caller).
//
//   POST { text, title?, stream?, severity? }
//   GET  -> { latest } (newest message; used by the notify-pipeline standing goal)
//
// Stream/severity are inferred from the emoji conventions the homelab
// notifiers already use, so callers can stay dumb (`curl -d '{"text":…}'`).
import { NextRequest, NextResponse } from "next/server";
import { createDoc, listDocs } from "@/lib/server-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STREAMS = ["alerts", "nightly", "weekly", "capture", "system"] as const;
const SEVERITIES = ["page", "info", "low"] as const;
type Stream = (typeof STREAMS)[number];
type Severity = (typeof SEVERITIES)[number];

const COLLECTION = "users/local/notifications";

function inferStream(text: string): Stream {
  if (/^(☕|♻️)/u.test(text)) return "weekly";
  if (/^🌙/u.test(text)) return "nightly";
  if (/^(📥|🎬)/u.test(text)) return "capture";
  return "alerts";
}

function inferSeverity(text: string, stream: Stream): Severity {
  if (/^(🚨|🛑|⚠️)/u.test(text)) return "page";
  return stream === "alerts" ? "page" : "info";
}

const NTFY_PRIORITY: Record<Severity, string> = {
  page: "urgent",
  info: "default",
  low: "min",
};

async function pushToNtfy(text: string, title: string | null, stream: Stream, severity: Severity) {
  const base = process.env.NTFY_URL;
  if (!base) return false;
  try {
    const res = await fetch(`${base}/${process.env.NTFY_TOPIC || "homelab"}`, {
      method: "POST",
      body: text,
      headers: {
        Title: title ?? `LifeOS · ${stream}`,
        Priority: NTFY_PRIORITY[severity],
        Tags: stream,
        Click: process.env.PAGER_CLICK_URL ?? "",
      },
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  let body: { text?: unknown; title?: unknown; stream?: unknown; severity?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) {
    return NextResponse.json({ error: "text required" }, { status: 400 });
  }

  const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : null;
  const stream = STREAMS.includes(body.stream as Stream)
    ? (body.stream as Stream)
    : inferStream(text);
  const severity = SEVERITIES.includes(body.severity as Severity)
    ? (body.severity as Severity)
    : inferSeverity(text, stream);

  const id = createDoc(COLLECTION, {
    stream,
    severity,
    title,
    body: text,
    createdAt: { __date: new Date().toISOString() },
    readAt: null,
  });

  const pushed = await pushToNtfy(text, title, stream, severity);
  return NextResponse.json({ id, stream, severity, pushed });
}

export async function GET() {
  const [latest] = listDocs(COLLECTION, {
    orderBy: ["createdAt", "desc"],
    limit: 1,
  });
  return NextResponse.json({ latest: latest ?? null });
}

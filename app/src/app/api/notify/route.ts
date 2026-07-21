// Homelab notification GATEWAY — the single entry point replacing the
// Telegram/n8n webhook. Stores every message in the local doc store
// (collection `users/local/notifications`, rendered by /pager), forwards it
// to the self-hosted ntfy instance (best-effort: a dead ntfy must never lose
// the message or fail the caller), and pushes high-severity messages to
// registered web-push subscriptions (PWA service worker, /api/push/*).
//
//   POST { text, title?, stream?, severity?, source? }
//   GET                     -> { latest } (newest message; the notify-pipeline goal depends on this shape)
//   GET ?limit=N[&stream=S] -> { messages: [...] } (recent history, newest-first; for reading the pager back)
//
// Stream/severity are inferred from the emoji conventions the homelab
// notifiers already use, so callers can stay dumb (`curl -d '{"text":…}'`).
// severity accepts BOTH vocabularies: legacy "page"|"info"|"low" (all
// existing callers, unchanged) and gateway "high"|"normal"|"low".
//
// Gateway behaviour (see src/lib/notify-gateway.ts):
//   - dedupe: identical (title+text) delivered once per 10 min; duplicates
//     are logged as deduped and delivered nowhere.
//   - quiet hours (default 23:00-07:00 Asia/Tokyo, users/local/settings doc
//     "notify"): web-push only for severity high; /pager always gets it.
//     The ntfy dual-write is deliberately UNTOUCHED until Samy verifies
//     web-push on his real phone (MAP.md T01) — do not gate or remove it.
//   - delivery log: users/local/notifyLog, pruned to 30 days on write.
import { NextRequest, NextResponse } from "next/server";
import { createDoc, listDocs, deleteDoc, runInTransaction } from "@/lib/server-db";
import type { QuerySpec } from "@/lib/server-db";
import {
  toGatewayLevel,
  toPagerSeverity,
  getNotifySettings,
  isQuietHours,
  decidePush,
  isDuplicate,
  appendNotifyLog,
  type GatewayLevel,
  type ChannelOutcome,
} from "@/lib/notify-gateway";
import { listPushSubs, sendPushToAll } from "@/lib/web-push-channel";
import { clickUrlForPath } from "@/lib/mobile/ntfy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STREAMS = ["alerts", "nightly", "weekly", "capture", "system"] as const;
// Legacy pager vocabulary + the gateway vocabulary — both accepted on POST.
const SEVERITIES = ["page", "info", "low", "high", "normal"] as const;
type Stream = (typeof STREAMS)[number];
type Severity = "page" | "info" | "low";

const COLLECTION = "users/local/notifications";

type PagerAction = { label: string; kind: "ack" };

// Deep-link target per message: callers pass an in-app `path` ("/prime",
// "/decide", …); when they don't, the stream picks a sensible screen. Every
// delivery channel consumes it — pager row link, ntfy Click, web-push URL.
const STREAM_PATHS: Record<Stream, string> = {
  alerts: "/pager",
  nightly: "/pager",
  weekly: "/pager",
  capture: "/decide", // captured items land in the triage deck
  system: "/pager",
};

// Absolute in-app path only — no scheme, no protocol-relative "//", no
// whitespace. Anything else is ignored (falls back to the stream default).
function parsePath(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const p = raw.trim();
  if (!p.startsWith("/") || p.startsWith("//") || p.length > 200 || /\s/.test(p)) return null;
  return p;
}

function parseActions(raw: unknown): PagerAction[] | null {
  if (!Array.isArray(raw)) return null;
  const actions = raw.filter(
    (a): a is PagerAction =>
      Boolean(a) &&
      typeof (a as PagerAction).label === "string" &&
      (a as PagerAction).kind === "ack"
  );
  return actions.length ? actions : null;
}

const DAY_MS = 86_400_000;

// Opportunistic retention sweep on every ingest: read messages older than
// 30 days and system-stream traffic (heartbeats) older than 7 days. The
// collection stays small, so a full scan per POST is fine.
function prune() {
  const now = Date.now();
  const docs = listDocs(COLLECTION);
  runInTransaction(() => {
    for (const d of docs) {
      const iso = (d.createdAt as { __date?: string } | undefined)?.__date;
      const created = iso ? Date.parse(iso) : NaN;
      if (Number.isNaN(created)) continue;
      const age = now - created;
      if ((d.stream === "system" && age > 7 * DAY_MS) || (d.readAt != null && age > 30 * DAY_MS)) {
        deleteDoc(COLLECTION, d.id);
      }
    }
  });
}

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

async function pushToNtfy(
  text: string,
  title: string | null,
  stream: Stream,
  severity: Severity,
  path: string
) {
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
        // Per-message deep link; PAGER_CLICK_URL stays as a global override.
        Click: process.env.PAGER_CLICK_URL || clickUrlForPath(path),
      },
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  let body: {
    text?: unknown;
    title?: unknown;
    stream?: unknown;
    severity?: unknown;
    source?: unknown;
    actions?: unknown;
    path?: unknown;
  };
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
  const source =
    typeof body.source === "string" && body.source.trim() ? body.source.trim() : null;
  const level: GatewayLevel = SEVERITIES.includes(body.severity as (typeof SEVERITIES)[number])
    ? toGatewayLevel(body.severity as (typeof SEVERITIES)[number])
    : toGatewayLevel(inferSeverity(text, stream));
  const severity = toPagerSeverity(level); // legacy vocabulary /pager stores + renders
  const path = parsePath(body.path) ?? STREAM_PATHS[stream];

  prune();

  // Dedupe: identical (title+text) already delivered within 10 min -> log it
  // as deduped and deliver nowhere (pager included — one delivery per window).
  if (isDuplicate(title, text)) {
    appendNotifyLog({
      title,
      text,
      severity: level,
      source,
      channels: { pager: "deduped", ntfy: "deduped", push: "deduped" },
    });
    return NextResponse.json({ id: null, stream, severity, pushed: false, deduped: true });
  }

  const id = createDoc(COLLECTION, {
    stream,
    severity,
    title,
    body: text,
    actions: parseActions(body.actions),
    path,
    createdAt: { __date: new Date().toISOString() },
    readAt: null,
  });

  // ntfy dual-write — behaviour unchanged (stays until Samy verifies web-push
  // on his phone; see MAP.md T01 gate).
  const pushed = await pushToNtfy(text, title, stream, severity, path);
  const ntfyOutcome: ChannelOutcome = !process.env.NTFY_URL ? "off" : pushed ? "delivered" : "error";

  // Web-push: high always; normal only outside quiet hours with pushNormal on;
  // low never. A failed/refused endpoint prunes the subscription.
  const settings = getNotifySettings();
  const quiet = isQuietHours(new Date(), settings);
  const decision = decidePush(level, quiet, settings, listPushSubs().length);
  let pushOutcome: ChannelOutcome = decision === "send" ? "error" : decision;
  let pushInfo: string | undefined;
  if (decision === "send") {
    const r = await sendPushToAll({
      title: title ?? `LifeOS · ${stream}`,
      body: text,
      tag: `lifeos-${stream}`,
      url: path,
    });
    pushOutcome = r.delivered > 0 ? "delivered" : "error";
    pushInfo = `${r.delivered}/${r.attempted} delivered${r.pruned ? `, ${r.pruned} pruned` : ""}${
      r.errors ? `, ${r.errors} errors` : ""
    }`;
  }

  appendNotifyLog({
    title,
    text,
    severity: level,
    source,
    channels: { pager: "delivered", ntfy: ntfyOutcome, push: pushOutcome },
    ...(pushInfo ? { pushInfo } : {}),
  });

  return NextResponse.json({ id, stream, severity, pushed, push: pushOutcome });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limitParam = searchParams.get("limit");
  const streamParam = searchParams.get("stream");

  // No query params: preserve the legacy { latest } shape the notify-pipeline
  // standing goal reads. Only the presence of ?limit/?stream switches to list.
  if (limitParam === null && streamParam === null) {
    const [latest] = listDocs(COLLECTION, {
      orderBy: ["createdAt", "desc"],
      limit: 1,
    });
    return NextResponse.json({ latest: latest ?? null });
  }

  const limit = Math.min(Math.max(Math.trunc(Number(limitParam)) || 20, 1), 100);
  const where: QuerySpec["where"] = STREAMS.includes(streamParam as Stream)
    ? [["stream", "==", streamParam]]
    : undefined;

  const messages = listDocs(COLLECTION, {
    ...(where ? { where } : {}),
    orderBy: ["createdAt", "desc"],
    limit,
  });
  return NextResponse.json({ messages });
}

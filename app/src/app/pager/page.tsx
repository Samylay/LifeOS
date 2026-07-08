"use client";

// Pager — the homelab notification inbox (Telegram replacement). Messages
// arrive via POST /api/notify; streams mirror the homelab's four sources.
import { useState } from "react";
import { BellRing, Check, CheckCheck, Trash2 } from "lucide-react";
import {
  useNotifications,
  PAGER_STREAMS,
  type PagerStream,
  type PagerMessage,
} from "@/lib/use-notifications";

const STREAM_LABELS: Record<PagerStream, string> = {
  alerts: "🚨 Alerts",
  nightly: "🌙 Nightly",
  weekly: "☕ Weekly",
  capture: "📥 Capture",
  system: "⚙️ System",
};

const SEVERITY_COLORS: Record<PagerMessage["severity"], string> = {
  page: "#EF4444",
  info: "var(--accent)",
  low: "var(--text-tertiary)",
};

function timeAgo(d: Date): string {
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export default function PagerPage() {
  const { messages, loading, markRead, markAllRead, ack, remove } = useNotifications();
  const [stream, setStream] = useState<PagerStream | "all">("all");

  const visible = stream === "all" ? messages : messages.filter((m) => m.stream === stream);
  const unreadCount = (s: PagerStream | "all") =>
    messages.filter((m) => !m.readAt && (s === "all" || m.stream === s)).length;

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <BellRing size={24} style={{ color: "var(--accent)" }} />
          <h1 className="text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>
            Pager
          </h1>
          {unreadCount("all") > 0 && (
            <span
              className="text-xs font-semibold rounded-full px-2 py-0.5"
              style={{ background: "var(--accent)", color: "white" }}
            >
              {unreadCount("all")}
            </span>
          )}
        </div>
        {unreadCount(stream) > 0 && (
          <button
            onClick={() => markAllRead(visible)}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
            style={{ color: "var(--text-secondary)", border: "1px solid var(--border-primary)" }}
          >
            <CheckCheck size={16} />
            Mark all read
          </button>
        )}
      </div>

      {/* Stream filter */}
      <div className="flex flex-wrap gap-2 mb-6">
        {(["all", ...PAGER_STREAMS] as const).map((s) => {
          const active = stream === s;
          const unread = unreadCount(s);
          return (
            <button
              key={s}
              onClick={() => setStream(s)}
              className="text-xs rounded-lg px-3 py-2 font-medium transition-colors"
              style={{
                background: active ? "var(--accent)" : "var(--bg-secondary)",
                color: active ? "white" : "var(--text-secondary)",
                border: "1px solid " + (active ? "var(--accent)" : "var(--border-primary)"),
              }}
            >
              {s === "all" ? "All" : STREAM_LABELS[s]}
              {unread > 0 && <span className="ml-1.5 font-semibold">{unread}</span>}
            </button>
          );
        })}
      </div>

      {loading ? (
        <p style={{ color: "var(--text-tertiary)" }}>Loading…</p>
      ) : visible.length === 0 ? (
        <p style={{ color: "var(--text-tertiary)" }}>Nothing here. The homelab is quiet.</p>
      ) : (
        <div className="space-y-2">
          {visible.map((m) => (
            <div
              key={m.id}
              className="rounded-xl p-4 flex items-start gap-3"
              style={{
                background: "var(--bg-secondary)",
                border: "1px solid var(--border-primary)",
                opacity: m.readAt ? 0.6 : 1,
              }}
            >
              <span
                className="mt-1.5 rounded-full shrink-0"
                style={{
                  width: 8,
                  height: 8,
                  background: m.readAt ? "transparent" : SEVERITY_COLORS[m.severity],
                  border: m.readAt ? "1px solid var(--border-primary)" : "none",
                }}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-medium" style={{ color: "var(--text-tertiary)" }}>
                    {STREAM_LABELS[m.stream] ?? m.stream} · {timeAgo(m.createdAt)}
                  </span>
                </div>
                {m.title && (
                  <p className="text-sm font-semibold mb-0.5" style={{ color: "var(--text-primary)" }}>
                    {m.title}
                  </p>
                )}
                <p
                  className="text-sm whitespace-pre-wrap break-words"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {m.body}
                </p>
                {!m.readAt && (m.actions?.length ?? 0) > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {m.actions!.map((a, i) => (
                      <button
                        key={i}
                        onClick={() => ack(m)}
                        className="text-xs rounded-lg px-3 py-1.5 font-medium transition-colors"
                        style={{
                          background: "var(--accent)",
                          color: "white",
                        }}
                      >
                        {a.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {!m.readAt && (
                  <button
                    onClick={() => markRead(m.id)}
                    className="p-1.5 rounded-lg transition-colors"
                    style={{ color: "var(--text-tertiary)" }}
                    title="Mark read"
                  >
                    <Check size={16} />
                  </button>
                )}
                <button
                  onClick={() => remove(m.id)}
                  className="p-1.5 rounded-lg transition-colors"
                  style={{ color: "var(--text-tertiary)" }}
                  title="Delete"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

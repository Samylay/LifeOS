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
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const STREAM_LABELS: Record<PagerStream, string> = {
  alerts: "🚨 Alerts",
  nightly: "🌙 Nightly",
  weekly: "☕ Weekly",
  capture: "📥 Capture",
  system: "⚙️ System",
};

const SEVERITY_COLORS: Record<PagerMessage["severity"], string> = {
  page: "#EF4444",
  info: "var(--primary)",
  low: "var(--muted-foreground)",
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
          <BellRing size={24} className="text-primary" />
          <h1 className="text-2xl font-semibold text-foreground">
            Pager
          </h1>
          {unreadCount("all") > 0 && (
            <Badge className="text-xs font-semibold">
              {unreadCount("all")}
            </Badge>
          )}
        </div>
        {unreadCount(stream) > 0 && (
          <Button
            onClick={() => markAllRead(visible)}
            variant="outline"
            size="sm"
            className="gap-1.5 text-sm font-medium text-muted-foreground"
          >
            <CheckCheck size={16} />
            Mark all read
          </Button>
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
              className={`text-xs rounded-lg px-3 py-2 font-medium border transition-colors ${
                active ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground border-border"
              }`}
            >
              {s === "all" ? "All" : STREAM_LABELS[s]}
              {unread > 0 && <span className="ml-1.5 font-semibold">{unread}</span>}
            </button>
          );
        })}
      </div>

      {loading ? (
        <p className="text-muted-foreground/70">Loading…</p>
      ) : visible.length === 0 ? (
        <p className="text-muted-foreground/70">Nothing here. The homelab is quiet.</p>
      ) : (
        <div className="space-y-2">
          {visible.map((m) => (
            <Card
              key={m.id}
              className="p-4 gap-0 flex-row items-start"
              style={{ opacity: m.readAt ? 0.6 : 1 }}
            >
              <span
                className="mt-1.5 mr-3 rounded-full shrink-0 h-2 w-2"
                style={{
                  background: m.readAt ? "transparent" : SEVERITY_COLORS[m.severity],
                  border: m.readAt ? "1px solid var(--border)" : "none",
                }}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-medium text-muted-foreground/70">
                    {STREAM_LABELS[m.stream] ?? m.stream} · {timeAgo(m.createdAt)}
                  </span>
                </div>
                {m.title && (
                  <p className="text-sm font-semibold mb-0.5 text-foreground">
                    {m.title}
                  </p>
                )}
                <p className="text-sm whitespace-pre-wrap break-words text-muted-foreground">
                  {m.body}
                </p>
                {!m.readAt && (m.actions?.length ?? 0) > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {m.actions!.map((a, i) => (
                      <Button
                        key={i}
                        onClick={() => ack(m)}
                        size="sm"
                        className="text-xs font-medium"
                      >
                        {a.label}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {!m.readAt && (
                  <button
                    onClick={() => markRead(m.id)}
                    className="p-1.5 rounded-lg transition-colors text-muted-foreground/70"
                    title="Mark read"
                  >
                    <Check size={16} />
                  </button>
                )}
                <button
                  onClick={() => remove(m.id)}
                  className="p-1.5 rounded-lg transition-colors text-muted-foreground/70"
                  title="Delete"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

"use client";

import { Calendar, ExternalLink, Loader2, Clock, MapPin } from "lucide-react";
import { useIntegrations } from "@/lib/integrations-context";
import { useGoogleCalendar, GCalEvent } from "@/lib/use-google-calendar";
import Link from "next/link";
import { useState } from "react";

function EventCard({ event }: { event: GCalEvent }) {
  const timeStr = event.allDay
    ? "All day"
    : `${event.start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} — ${event.end.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;

  return (
    <div
      className="flex items-start gap-3 rounded-lg p-3"
      style={{ background: "var(--bg-tertiary)" }}
    >
      <div
        className="mt-0.5 h-2 w-2 shrink-0 rounded-full"
        style={{ background: "#4285F4" }}
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>
          {event.title}
        </p>
        <div className="flex items-center gap-3 mt-1">
          <span className="flex items-center gap-1 text-xs" style={{ color: "var(--text-tertiary)" }}>
            <Clock size={10} />
            {timeStr}
          </span>
          {event.location && (
            <span className="flex items-center gap-1 text-xs truncate" style={{ color: "var(--text-tertiary)" }}>
              <MapPin size={10} />
              {event.location}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CalendarPage() {
  const { gcal, connectGoogleCalendar } = useIntegrations();
  const { events, loading, error, hasToken, connected } = useGoogleCalendar();
  const [connecting, setConnecting] = useState(false);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      await connectGoogleCalendar();
    } catch {
      // handled by integrations context
    } finally {
      setConnecting(false);
    }
  };

  // Group events by date
  const grouped = events.reduce<Record<string, GCalEvent[]>>((acc, event) => {
    const key = event.start.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
    if (!acc[key]) acc[key] = [];
    acc[key].push(event);
    return acc;
  }, {});

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>
          Calendar
        </h1>
        {connected && (
          <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
            Showing next 7 days from Google Calendar
          </span>
        )}
      </div>

      {/* Not connected at all */}
      {!connected && (
        <div
          className="flex flex-col items-center justify-center py-16 rounded-xl"
          style={{
            background: "var(--bg-secondary)",
            border: "1px solid var(--border-primary)",
          }}
        >
          <Calendar size={48} style={{ color: "var(--text-tertiary)" }} className="mb-4" />
          <p className="text-lg font-medium" style={{ color: "var(--text-primary)" }}>
            Connect Google Calendar
          </p>
          <p className="text-sm mt-1 mb-4" style={{ color: "var(--text-secondary)" }}>
            See your schedule and events right inside LifeOS.
          </p>
          <button
            onClick={handleConnect}
            disabled={connecting}
            className="flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white transition-colors hover:opacity-90"
            style={{ background: "#4285F4" }}
          >
            {connecting ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <ExternalLink size={16} />
            )}
            Connect Google Calendar
          </button>
          <p className="text-xs mt-3" style={{ color: "var(--text-tertiary)" }}>
            Or connect via{" "}
            <Link href="/settings" className="underline" style={{ color: "var(--accent)" }}>
              Settings
            </Link>
          </p>
        </div>
      )}

      {/* Connected but no token (session expired) */}
      {connected && !hasToken && !loading && (
        <div
          className="flex flex-col items-center justify-center py-16 rounded-xl"
          style={{
            background: "var(--bg-secondary)",
            border: "1px solid var(--border-primary)",
          }}
        >
          <Calendar size={48} style={{ color: "var(--text-tertiary)" }} className="mb-4" />
          <p className="text-lg font-medium" style={{ color: "var(--text-primary)" }}>
            Session expired
          </p>
          <p className="text-sm mt-1 mb-4" style={{ color: "var(--text-secondary)" }}>
            Reconnect to sync your Google Calendar events.
          </p>
          <button
            onClick={handleConnect}
            disabled={connecting}
            className="flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white transition-colors hover:opacity-90"
            style={{ background: "#4285F4" }}
          >
            {connecting ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <ExternalLink size={16} />
            )}
            Reconnect
          </button>
        </div>
      )}

      {/* Loading */}
      {connected && hasToken && loading && (
        <div
          className="flex items-center justify-center py-16 rounded-xl"
          style={{
            background: "var(--bg-secondary)",
            border: "1px solid var(--border-primary)",
          }}
        >
          <Loader2 size={24} className="animate-spin" style={{ color: "var(--accent)" }} />
        </div>
      )}

      {/* Token expired error */}
      {error === "token_expired" && (
        <div
          className="flex flex-col items-center justify-center py-16 rounded-xl"
          style={{
            background: "var(--bg-secondary)",
            border: "1px solid var(--border-primary)",
          }}
        >
          <p className="text-sm mb-3" style={{ color: "var(--text-secondary)" }}>
            Your session has expired.
          </p>
          <button
            onClick={handleConnect}
            disabled={connecting}
            className="flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white transition-colors hover:opacity-90"
            style={{ background: "#4285F4" }}
          >
            {connecting ? <Loader2 size={16} className="animate-spin" /> : <ExternalLink size={16} />}
            Reconnect
          </button>
        </div>
      )}

      {/* Events loaded */}
      {connected && hasToken && !loading && !error && (
        <div className="space-y-6">
          {Object.keys(grouped).length === 0 ? (
            <div
              className="flex flex-col items-center justify-center py-16 rounded-xl"
              style={{
                background: "var(--bg-secondary)",
                border: "1px solid var(--border-primary)",
              }}
            >
              <Calendar size={48} style={{ color: "var(--text-tertiary)" }} className="mb-4" />
              <p className="text-lg font-medium" style={{ color: "var(--text-primary)" }}>
                No events this week
              </p>
              <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
                Your next 7 days are clear.
              </p>
            </div>
          ) : (
            Object.entries(grouped).map(([date, dayEvents]) => (
              <div key={date}>
                <h3 className="text-sm font-semibold mb-2 px-1" style={{ color: "var(--text-secondary)" }}>
                  {date}
                </h3>
                <div
                  className="space-y-2 rounded-xl p-4"
                  style={{
                    background: "var(--bg-secondary)",
                    border: "1px solid var(--border-primary)",
                  }}
                >
                  {dayEvents.map((event) => (
                    <EventCard key={event.id} event={event} />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

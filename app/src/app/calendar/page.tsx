"use client";

import { Calendar, ExternalLink, Loader2, Clock, MapPin, ChevronLeft, ChevronRight } from "lucide-react";
import { useIntegrations } from "@/lib/integrations-context";
import { useGoogleCalendar, GCalEvent } from "@/lib/use-google-calendar";
import { useFocusBlocks } from "@/lib/use-focus-blocks";
import Link from "next/link";
import { useState, useMemo } from "react";
import { AREAS } from "@/lib/types";

const AREA_COLORS: Record<string, string> = {
  health: "#14B8A6",
  career: "#6366F1",
  finance: "#F59E0B",
  brand: "#8B5CF6",
  admin: "#64748B",
};

function getWeekDates(offset: number) {
  const today = new Date();
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay() + 1 + offset * 7); // Monday

  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    days.push(d);
  }
  return days;
}

function formatDateKey(date: Date): string {
  return date.toISOString().split("T")[0];
}

const HOURS = Array.from({ length: 14 }, (_, i) => i + 7); // 7:00 — 20:00

function EventCard({ event }: { event: GCalEvent }) {
  const timeStr = event.allDay
    ? "All day"
    : `${event.start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} — ${event.end.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;

  return (
    <div className="flex items-start gap-2 rounded-lg p-2 mb-1" style={{ background: "#4285F415", borderLeft: "2px solid #4285F4" }}>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate" style={{ color: "var(--text-primary)" }}>{event.title}</p>
        <span className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>
          <Clock size={8} className="inline mr-1" />{timeStr}
        </span>
        {event.location && (
          <span className="text-[10px] ml-2" style={{ color: "var(--text-tertiary)" }}>
            <MapPin size={8} className="inline mr-0.5" />{event.location}
          </span>
        )}
      </div>
    </div>
  );
}

function FocusBlockCard({ block }: { block: { title: string; startTime: string; endTime: string; area?: string; status: string; goal?: string } }) {
  const color = block.area ? AREA_COLORS[block.area] || "#10B981" : "#10B981";

  return (
    <div className="rounded-lg p-2 mb-1" style={{ background: `${color}15`, borderLeft: `2px solid ${color}` }}>
      <p className="text-xs font-medium truncate" style={{ color: "var(--text-primary)" }}>{block.title}</p>
      <span className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>
        {block.startTime} — {block.endTime}
      </span>
      {block.goal && (
        <p className="text-[10px] truncate mt-0.5" style={{ color: "var(--text-tertiary)" }}>{block.goal}</p>
      )}
    </div>
  );
}

export default function CalendarPage() {
  const { gcal, connectGoogleCalendar } = useIntegrations();
  const { events, loading, error, hasToken, connected } = useGoogleCalendar();
  const { blocks } = useFocusBlocks();
  const [connecting, setConnecting] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);

  const weekDays = useMemo(() => getWeekDates(weekOffset), [weekOffset]);

  const handleConnect = async () => {
    setConnecting(true);
    try { await connectGoogleCalendar(); } catch {} finally { setConnecting(false); }
  };

  // Group events by date
  const eventsByDate = useMemo(() => {
    const map: Record<string, GCalEvent[]> = {};
    for (const event of events) {
      const key = formatDateKey(event.start);
      if (!map[key]) map[key] = [];
      map[key].push(event);
    }
    return map;
  }, [events]);

  // Group blocks by date
  const blocksByDate = useMemo(() => {
    const map: Record<string, typeof blocks> = {};
    for (const block of blocks) {
      if (!map[block.date]) map[block.date] = [];
      map[block.date].push(block);
    }
    return map;
  }, [blocks]);

  const today = formatDateKey(new Date());

  const weekLabel = `${weekDays[0].toLocaleDateString("en-US", { month: "short", day: "numeric" })} — ${weekDays[6].toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>Calendar</h1>
        <div className="flex items-center gap-3">
          <button onClick={() => setWeekOffset((o) => o - 1)} className="p-1.5 rounded-lg" style={{ color: "var(--text-secondary)" }}>
            <ChevronLeft size={18} />
          </button>
          <span className="text-sm font-medium min-w-[200px] text-center" style={{ color: "var(--text-primary)" }}>{weekLabel}</span>
          <button onClick={() => setWeekOffset((o) => o + 1)} className="p-1.5 rounded-lg" style={{ color: "var(--text-secondary)" }}>
            <ChevronRight size={18} />
          </button>
          {weekOffset !== 0 && (
            <button onClick={() => setWeekOffset(0)} className="text-xs px-2 py-1 rounded-lg" style={{ color: "var(--accent)" }}>
              Today
            </button>
          )}
        </div>
      </div>

      {/* Not connected - prompt */}
      {!connected && (
        <div className="rounded-xl p-4 mb-6 flex items-center justify-between" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}>
          <div>
            <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Google Calendar</p>
            <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>Connect to see your events alongside focus blocks.</p>
          </div>
          <button onClick={handleConnect} disabled={connecting}
            className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium text-white transition-colors hover:opacity-90"
            style={{ background: "#4285F4" }}>
            {connecting ? <Loader2 size={14} className="animate-spin" /> : <ExternalLink size={14} />}
            Connect
          </button>
        </div>
      )}

      {/* Weekly Grid */}
      <div className="rounded-xl overflow-hidden" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}>
        {/* Day headers */}
        <div className="grid grid-cols-7 border-b" style={{ borderColor: "var(--border-primary)" }}>
          {weekDays.map((day) => {
            const key = formatDateKey(day);
            const isToday = key === today;
            return (
              <div key={key} className="px-2 py-3 text-center" style={{ borderRight: "1px solid var(--border-primary)" }}>
                <p className="text-xs font-medium" style={{ color: isToday ? "var(--accent)" : "var(--text-secondary)" }}>
                  {day.toLocaleDateString("en-US", { weekday: "short" })}
                </p>
                <p className={`text-lg font-semibold ${isToday ? "bg-emerald-500 text-white rounded-full w-8 h-8 flex items-center justify-center mx-auto" : ""}`}
                  style={{ color: isToday ? undefined : "var(--text-primary)" }}>
                  {day.getDate()}
                </p>
              </div>
            );
          })}
        </div>

        {/* Day columns with events and blocks */}
        <div className="grid grid-cols-7 min-h-[400px]">
          {weekDays.map((day) => {
            const key = formatDateKey(day);
            const dayEvents = eventsByDate[key] || [];
            const dayBlocks = blocksByDate[key] || [];
            const isToday = key === today;

            return (
              <div key={key} className="p-2 min-h-[400px]"
                style={{
                  borderRight: "1px solid var(--border-primary)",
                  background: isToday ? "var(--accent-bg, rgba(16, 185, 129, 0.03))" : undefined,
                }}>
                {/* Focus blocks */}
                {dayBlocks.map((block) => (
                  <FocusBlockCard key={block.id} block={block} />
                ))}

                {/* Google Calendar events */}
                {dayEvents.map((event) => (
                  <EventCard key={event.id} event={event} />
                ))}

                {dayEvents.length === 0 && dayBlocks.length === 0 && (
                  <p className="text-[10px] text-center mt-8" style={{ color: "var(--text-tertiary)" }}>
                    —
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

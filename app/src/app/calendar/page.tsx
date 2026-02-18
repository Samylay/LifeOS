"use client";

import {
  Calendar,
  ExternalLink,
  Loader2,
  Clock,
  MapPin,
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  LayoutGrid,
  List,
  CalendarDays,
  Settings2,
  Info,
} from "lucide-react";
import { useIntegrations } from "@/lib/integrations-context";
import { useGoogleCalendar, GCalEvent } from "@/lib/use-google-calendar";
import { useState, useMemo } from "react";
import { useToast } from "@/components/toast";

// ─── Types & Constants ──────────────────────────────────────

type EmbedMode = "WEEK" | "MONTH" | "AGENDA";
type ViewTab = "google" | "lifeos";

// ─── Helper Functions ───────────────────────────────────────

function getWeekDates(offset: number) {
  const today = new Date();
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay() + 1 + offset * 7);
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

function todayKey(): string {
  return formatDateKey(new Date());
}

function formatTimeForInput(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function formatDateForInput(date: Date): string {
  return date.toISOString().split("T")[0];
}

// ─── Google Calendar Embed ──────────────────────────────────

function CalendarEmbed({
  calendarId,
  mode,
  timezone,
}: {
  calendarId: string;
  mode: EmbedMode;
  timezone: string;
}) {
  const [loading, setLoading] = useState(true);

  const embedUrl = useMemo(() => {
    const params = new URLSearchParams({
      src: calendarId,
      ctz: timezone,
      mode,
      showTitle: "0",
      showPrint: "0",
      showCalendars: "0",
      showTz: "0",
      showNav: "1",
      showDate: "1",
      showTabs: "0",
    });
    return `https://calendar.google.com/calendar/embed?${params}`;
  }, [calendarId, mode, timezone]);

  return (
    <div className="relative rounded-xl overflow-hidden" style={{ border: "1px solid var(--border-primary)" }}>
      {loading && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ background: "var(--bg-secondary)", zIndex: 2 }}
        >
          <div className="flex flex-col items-center gap-2">
            <Loader2 size={24} className="animate-spin" style={{ color: "var(--accent)" }} />
            <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
              Loading Google Calendar...
            </span>
          </div>
        </div>
      )}
      <iframe
        src={embedUrl}
        style={{ border: 0, width: "100%", height: "calc(100vh - 220px)", minHeight: 500 }}
        onLoad={() => setLoading(false)}
        title="Google Calendar"
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
      />
    </div>
  );
}

// ─── Setup Instructions ─────────────────────────────────────

function EmbedSetupGuide({ email }: { email: string | null }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="rounded-xl p-4 mb-4"
      style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full text-left"
      >
        <Info size={16} style={{ color: "#4285F4" }} />
        <span className="text-sm font-medium flex-1" style={{ color: "var(--text-primary)" }}>
          First time? Enable calendar embed
        </span>
        <ChevronRight
          size={14}
          className="transition-transform"
          style={{
            color: "var(--text-tertiary)",
            transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
          }}
        />
      </button>
      {expanded && (
        <div className="mt-3 pt-3 space-y-2" style={{ borderTop: "1px solid var(--border-primary)" }}>
          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
            The Google Calendar embed requires your calendar to be accessible via link. To enable:
          </p>
          <ol className="text-xs space-y-1.5 pl-4 list-decimal" style={{ color: "var(--text-secondary)" }}>
            <li>
              Open{" "}
              <a
                href="https://calendar.google.com/calendar/r/settings"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
                style={{ color: "#4285F4" }}
              >
                Google Calendar Settings
              </a>
            </li>
            <li>Under &quot;Settings for my calendars&quot;, click your calendar{email ? ` (${email})` : ""}</li>
            <li>Scroll to &quot;Access permissions for events&quot;</li>
            <li>Check &quot;Make available to public&quot; → select &quot;See all event details&quot;</li>
          </ol>
          <p className="text-[10px] mt-2" style={{ color: "var(--text-tertiary)" }}>
            If you prefer not to make your calendar public, use the &quot;LifeOS&quot; tab instead — it pulls events via API without needing public access.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Quick Add Event ────────────────────────────────────────

function QuickAddEvent({ onClose }: { onClose: () => void }) {
  const { createCalendarEvent, gcal } = useIntegrations();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  const now = new Date();
  const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);

  const [title, setTitle] = useState("");
  const [date, setDate] = useState(formatDateForInput(now));
  const [startTime, setStartTime] = useState(formatTimeForInput(now));
  const [endTime, setEndTime] = useState(formatTimeForInput(oneHourLater));
  const [description, setDescription] = useState("");

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);

    const start = new Date(`${date}T${startTime}:00`);
    const end = new Date(`${date}T${endTime}:00`);

    const ok = await createCalendarEvent({
      title: title.trim(),
      start,
      end,
      description: description.trim() || undefined,
    });

    if (ok) {
      toast("Event added to Google Calendar");
      onClose();
    } else {
      toast("Failed to create event — check your connection", "error");
    }
    setSaving(false);
  };

  if (!gcal.accessToken) {
    return (
      <div
        className="rounded-xl p-4 mb-4"
        style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}
      >
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Connect Google Calendar in{" "}
          <a href="/settings" className="underline" style={{ color: "var(--accent)" }}>
            Settings
          </a>{" "}
          to create events.
        </p>
      </div>
    );
  }

  return (
    <div
      className="rounded-xl p-4 mb-4"
      style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          Quick Add Event
        </h3>
        <button onClick={onClose} className="p-1 rounded-lg" style={{ color: "var(--text-tertiary)" }}>
          <X size={14} />
        </button>
      </div>

      <div className="space-y-3">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Event title"
          autoFocus
          className="w-full text-sm bg-transparent rounded-lg px-3 py-2 outline-none"
          style={{ border: "1px solid var(--border-primary)", color: "var(--text-primary)" }}
          onKeyDown={(e) => e.key === "Enter" && handleSave()}
        />

        <div className="flex gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="flex-1 text-sm bg-transparent rounded-lg px-3 py-2 outline-none"
            style={{ border: "1px solid var(--border-primary)", color: "var(--text-primary)" }}
          />
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="w-28 text-sm bg-transparent rounded-lg px-3 py-2 outline-none"
            style={{ border: "1px solid var(--border-primary)", color: "var(--text-primary)" }}
          />
          <span className="self-center text-xs" style={{ color: "var(--text-tertiary)" }}>to</span>
          <input
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            className="w-28 text-sm bg-transparent rounded-lg px-3 py-2 outline-none"
            style={{ border: "1px solid var(--border-primary)", color: "var(--text-primary)" }}
          />
        </div>

        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
          rows={2}
          className="w-full text-sm bg-transparent rounded-lg px-3 py-2 outline-none resize-none"
          style={{ border: "1px solid var(--border-primary)", color: "var(--text-primary)" }}
        />

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="text-xs px-3 py-1.5 rounded-lg"
            style={{ color: "var(--text-secondary)" }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !title.trim()}
            className="flex items-center gap-1.5 text-xs font-medium px-4 py-1.5 rounded-lg text-white transition-colors hover:opacity-90 disabled:opacity-50"
            style={{ background: "#4285F4" }}
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
            Add to Google Calendar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── LifeOS Calendar View (API-powered) ─────────────────────

function EventCard({ event }: { event: GCalEvent }) {
  const timeStr = event.allDay
    ? "All day"
    : `${event.start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} — ${event.end.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;

  return (
    <div
      className="flex items-start gap-2 rounded-lg p-2 mb-1"
      style={{ background: "#4285F415", borderLeft: "2px solid #4285F4" }}
    >
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate" style={{ color: "var(--text-primary)" }}>
          {event.title}
        </p>
        <span className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>
          <Clock size={8} className="inline mr-1" />
          {timeStr}
        </span>
        {event.location && (
          <span className="text-[10px] ml-2" style={{ color: "var(--text-tertiary)" }}>
            <MapPin size={8} className="inline mr-0.5" />
            {event.location}
          </span>
        )}
      </div>
    </div>
  );
}

function LifeOSCalendarView({
  events,
  weekOffset,
  setWeekOffset,
}: {
  events: GCalEvent[];
  weekOffset: number;
  setWeekOffset: (fn: (o: number) => number) => void;
}) {
  const weekDays = useMemo(() => getWeekDates(weekOffset), [weekOffset]);
  const today = todayKey();

  const eventsByDate = useMemo(() => {
    const map: Record<string, GCalEvent[]> = {};
    for (const event of events) {
      const key = formatDateKey(event.start);
      if (!map[key]) map[key] = [];
      map[key].push(event);
    }
    return map;
  }, [events]);

  const weekLabel = `${weekDays[0].toLocaleDateString("en-US", { month: "short", day: "numeric" })} — ${weekDays[6].toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;

  return (
    <>
      {/* Week navigation */}
      <div className="flex items-center justify-center gap-3 mb-4">
        <button
          onClick={() => setWeekOffset((o) => o - 1)}
          className="p-1.5 rounded-lg"
          style={{ color: "var(--text-secondary)" }}
        >
          <ChevronLeft size={18} />
        </button>
        <span
          className="text-sm font-medium min-w-[200px] text-center"
          style={{ color: "var(--text-primary)" }}
        >
          {weekLabel}
        </span>
        <button
          onClick={() => setWeekOffset((o) => o + 1)}
          className="p-1.5 rounded-lg"
          style={{ color: "var(--text-secondary)" }}
        >
          <ChevronRight size={18} />
        </button>
        {weekOffset !== 0 && (
          <button
            onClick={() => setWeekOffset(() => 0)}
            className="text-xs px-2 py-1 rounded-lg"
            style={{ color: "var(--accent)" }}
          >
            Today
          </button>
        )}
      </div>

      {/* Weekly Grid */}
      <div
        className="rounded-xl overflow-hidden"
        style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}
      >
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
                <p
                  className={`text-lg font-semibold ${isToday ? "bg-emerald-500 text-white rounded-full w-8 h-8 flex items-center justify-center mx-auto" : ""}`}
                  style={{ color: isToday ? undefined : "var(--text-primary)" }}
                >
                  {day.getDate()}
                </p>
              </div>
            );
          })}
        </div>

        {/* Day columns */}
        <div className="grid grid-cols-7 min-h-[400px]">
          {weekDays.map((day) => {
            const key = formatDateKey(day);
            const dayEvents = eventsByDate[key] || [];
            const isToday = key === today;

            return (
              <div
                key={key}
                className="p-2 min-h-[400px]"
                style={{
                  borderRight: "1px solid var(--border-primary)",
                  background: isToday ? "var(--accent-bg, rgba(16, 185, 129, 0.03))" : undefined,
                }}
              >
                {dayEvents.map((event) => (
                  <EventCard key={event.id} event={event} />
                ))}
                {dayEvents.length === 0 && (
                  <p className="text-[10px] text-center mt-8" style={{ color: "var(--text-tertiary)" }}>
                    —
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

// ─── Connection Prompt ──────────────────────────────────────

function ConnectPrompt({ onConnect, connecting }: { onConnect: () => void; connecting: boolean }) {
  return (
    <div
      className="rounded-xl p-6 flex flex-col items-center justify-center gap-4 text-center"
      style={{
        background: "var(--bg-secondary)",
        border: "1px solid var(--border-primary)",
        minHeight: 300,
      }}
    >
      <Calendar size={40} style={{ color: "var(--text-tertiary)" }} />
      <div>
        <p className="text-sm font-medium mb-1" style={{ color: "var(--text-primary)" }}>
          Connect Google Calendar
        </p>
        <p className="text-xs max-w-sm" style={{ color: "var(--text-tertiary)" }}>
          Connect your Google Calendar to see events, create new ones from LifeOS.
        </p>
      </div>
      <button
        onClick={onConnect}
        disabled={connecting}
        className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors hover:opacity-90"
        style={{ background: "#4285F4" }}
      >
        {connecting ? <Loader2 size={16} className="animate-spin" /> : <ExternalLink size={16} />}
        Connect Google Calendar
      </button>
    </div>
  );
}

// ─── Main Calendar Page ─────────────────────────────────────

export default function CalendarPage() {
  const { gcal, connectGoogleCalendar } = useIntegrations();
  const { events } = useGoogleCalendar();
  const { toast } = useToast();

  const [connecting, setConnecting] = useState(false);
  const [viewTab, setViewTab] = useState<ViewTab>("google");
  const [embedMode, setEmbedMode] = useState<EmbedMode>("WEEK");
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [calendarId, setCalendarId] = useState("");
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);

  const effectiveCalendarId = calendarId.trim() || gcal.email || "";

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

  const embedModeButtons: { mode: EmbedMode; icon: typeof LayoutGrid; label: string }[] = [
    { mode: "WEEK", icon: LayoutGrid, label: "Week" },
    { mode: "MONTH", icon: CalendarDays, label: "Month" },
    { mode: "AGENDA", icon: List, label: "Agenda" },
  ];

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>
            Calendar
          </h1>

          {/* View tabs */}
          {gcal.connected && (
            <div
              className="flex rounded-lg p-0.5"
              style={{ background: "var(--bg-tertiary)" }}
            >
              {(["google", "lifeos"] as ViewTab[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setViewTab(tab)}
                  className="text-xs font-medium px-3 py-1.5 rounded-md transition-colors"
                  style={{
                    background: viewTab === tab ? "var(--bg-secondary)" : "transparent",
                    color: viewTab === tab ? "var(--text-primary)" : "var(--text-tertiary)",
                    boxShadow: viewTab === tab ? "var(--shadow-sm)" : "none",
                  }}
                >
                  {tab === "google" ? "Google Calendar" : "LifeOS View"}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Embed mode toggle (only for google view) */}
          {viewTab === "google" && gcal.connected && (
            <div className="flex rounded-lg p-0.5" style={{ background: "var(--bg-tertiary)" }}>
              {embedModeButtons.map(({ mode, icon: Icon, label }) => (
                <button
                  key={mode}
                  onClick={() => setEmbedMode(mode)}
                  className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-md transition-colors"
                  style={{
                    background: embedMode === mode ? "var(--bg-secondary)" : "transparent",
                    color: embedMode === mode ? "var(--text-primary)" : "var(--text-tertiary)",
                    boxShadow: embedMode === mode ? "var(--shadow-sm)" : "none",
                  }}
                  title={label}
                >
                  <Icon size={12} />
                  <span className="hidden sm:inline">{label}</span>
                </button>
              ))}
            </div>
          )}

          {/* Add event */}
          {gcal.connected && gcal.accessToken && (
            <button
              onClick={() => setShowAddEvent(!showAddEvent)}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg text-white transition-colors hover:opacity-90"
              style={{ background: "#4285F4" }}
            >
              <Plus size={14} />
              <span className="hidden sm:inline">Add Event</span>
            </button>
          )}

          {/* Settings */}
          {viewTab === "google" && gcal.connected && (
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="p-1.5 rounded-lg transition-colors"
              style={{ color: showSettings ? "var(--accent)" : "var(--text-tertiary)" }}
              title="Embed settings"
            >
              <Settings2 size={16} />
            </button>
          )}

          {/* Open in Google Calendar */}
          {gcal.connected && (
            <a
              href="https://calendar.google.com"
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded-lg transition-colors"
              style={{ color: "var(--text-tertiary)" }}
              title="Open Google Calendar"
            >
              <ExternalLink size={16} />
            </a>
          )}
        </div>
      </div>

      {/* Embed settings */}
      {showSettings && viewTab === "google" && (
        <div
          className="rounded-xl p-4 mb-4 space-y-3"
          style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              Embed Settings
            </h3>
            <button onClick={() => setShowSettings(false)} className="p-1" style={{ color: "var(--text-tertiary)" }}>
              <X size={14} />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs block mb-1" style={{ color: "var(--text-secondary)" }}>
                Calendar ID
              </label>
              <input
                type="text"
                value={calendarId}
                onChange={(e) => setCalendarId(e.target.value)}
                placeholder={gcal.email || "your@email.com"}
                className="w-full text-xs bg-transparent rounded-lg px-3 py-2 outline-none"
                style={{ border: "1px solid var(--border-primary)", color: "var(--text-primary)" }}
              />
              <p className="text-[10px] mt-1" style={{ color: "var(--text-tertiary)" }}>
                Defaults to your connected Google account email.
              </p>
            </div>
            <div>
              <label className="text-xs block mb-1" style={{ color: "var(--text-secondary)" }}>
                Timezone
              </label>
              <input
                type="text"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                placeholder="Europe/Paris"
                className="w-full text-xs bg-transparent rounded-lg px-3 py-2 outline-none"
                style={{ border: "1px solid var(--border-primary)", color: "var(--text-primary)" }}
              />
              <p className="text-[10px] mt-1" style={{ color: "var(--text-tertiary)" }}>
                Auto-detected from your browser.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Quick Add Event form */}
      {showAddEvent && <QuickAddEvent onClose={() => setShowAddEvent(false)} />}

      {/* Not connected */}
      {!gcal.connected && <ConnectPrompt onConnect={handleConnect} connecting={connecting} />}

      {/* Connected — content */}
      {gcal.connected && (
        <div>
          {viewTab === "google" && (
            <>
              <EmbedSetupGuide email={gcal.email} />
              {effectiveCalendarId ? (
                <CalendarEmbed
                  calendarId={effectiveCalendarId}
                  mode={embedMode}
                  timezone={timezone}
                />
              ) : (
                <div
                  className="rounded-xl p-8 text-center"
                  style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}
                >
                  <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                    No calendar ID available. Connect Google Calendar or enter a calendar ID in settings.
                  </p>
                </div>
              )}
            </>
          )}

          {viewTab === "lifeos" && (
            <LifeOSCalendarView
              events={events}
              weekOffset={weekOffset}
              setWeekOffset={setWeekOffset}
            />
          )}
        </div>
      )}
    </div>
  );
}

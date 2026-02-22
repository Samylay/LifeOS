"use client";

import {
  Calendar,
  CalendarDays,
  Clock,
  Plus,
  Eye,
  Globe,
  Zap,
  ArrowRight,
  Hammer,
} from "lucide-react";

// ─── Feature cards data ─────────────────────────────────────

const FEATURES = [
  {
    icon: Eye,
    title: "Multiple View Modes",
    description:
      "Switch between week, month, and agenda views. See your schedule the way that works best for you.",
  },
  {
    icon: Plus,
    title: "Quick Event Creation",
    description:
      "Add events directly from Stride — set a title, date, time, and description without leaving the app.",
  },
  {
    icon: CalendarDays,
    title: "Weekly Grid View",
    description:
      "A custom Stride-native weekly calendar grid showing all your events at a glance with day-by-day navigation.",
  },
  {
    icon: Globe,
    title: "Google Calendar Sync",
    description:
      "Two-way integration with Google Calendar via OAuth. Your events stay in sync across both platforms.",
  },
  {
    icon: Clock,
    title: "Dashboard Schedule",
    description:
      "Today's upcoming events surface automatically on your dashboard so you always know what's next.",
  },
  {
    icon: Zap,
    title: "Smart Timezone Support",
    description:
      "Auto-detected timezone with manual override. Travel-friendly and always accurate.",
  },
];

// ─── Main Page ──────────────────────────────────────────────

export default function CalendarPage() {
  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      {/* Hero section */}
      <div className="text-center mb-12">
        <div
          className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-6"
          style={{
            background: "linear-gradient(135deg, var(--accent), var(--accent-secondary, #34d399))",
            boxShadow: "0 8px 32px rgba(16, 185, 129, 0.2)",
          }}
        >
          <Calendar size={32} className="text-white" />
        </div>

        <div
          className="inline-flex items-center gap-2 rounded-full px-3 py-1 mb-4 text-xs font-medium"
          style={{
            background: "var(--accent-bg)",
            color: "var(--accent)",
            border: "1px solid var(--accent)",
          }}
        >
          <Hammer size={12} />
          Under Construction
        </div>

        <h1
          className="text-3xl font-bold mb-3 tracking-tight"
          style={{ color: "var(--text-primary)" }}
        >
          Calendar
        </h1>
        <p
          className="text-base leading-relaxed max-w-md mx-auto"
          style={{ color: "var(--text-secondary)" }}
        >
          A unified calendar experience powered by Google Calendar — view events, create new ones, and stay on top of your schedule without leaving Stride.
        </p>
      </div>

      {/* Feature grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-12">
        {FEATURES.map((feature) => {
          const Icon = feature.icon;
          return (
            <div
              key={feature.title}
              className="group rounded-xl p-5 transition-all"
              style={{
                background: "var(--bg-secondary)",
                border: "1px solid var(--border-primary)",
              }}
            >
              <div className="flex items-start gap-3">
                <div
                  className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center"
                  style={{ background: "var(--accent-bg)" }}
                >
                  <Icon size={18} style={{ color: "var(--accent)" }} />
                </div>
                <div>
                  <h3
                    className="text-sm font-semibold mb-1"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {feature.title}
                  </h3>
                  <p
                    className="text-xs leading-relaxed"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    {feature.description}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom CTA / info */}
      <div
        className="rounded-xl p-6 text-center"
        style={{
          background: "var(--bg-secondary)",
          border: "1px dashed var(--border-primary)",
        }}
      >
        <p
          className="text-sm font-medium mb-1"
          style={{ color: "var(--text-primary)" }}
        >
          This feature is being rebuilt
        </p>
        <p
          className="text-xs max-w-sm mx-auto"
          style={{ color: "var(--text-tertiary)" }}
        >
          The calendar integration is getting a fresh overhaul. Connect your Google account in{" "}
          <a
            href="/settings"
            className="underline transition-colors"
            style={{ color: "var(--accent)" }}
          >
            Settings
          </a>{" "}
          to be ready when it launches.
        </p>
      </div>
    </div>
  );
}

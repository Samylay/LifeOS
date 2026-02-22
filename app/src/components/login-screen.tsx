"use client";

import { useAuth } from "@/lib/auth-context";
import { Timer, Target, BarChart3, Calendar, Flame, FolderKanban } from "lucide-react";

const FEATURES = [
  { icon: Timer, label: "Focus Timer", desc: "Pomodoro sessions with area tracking" },
  { icon: Target, label: "Quests & Goals", desc: "90-day missions and quarterly goals" },
  { icon: FolderKanban, label: "Project Board", desc: "Kanban-style project management" },
  { icon: Calendar, label: "Calendar Sync", desc: "Google Calendar integration" },
  { icon: Flame, label: "Streaks", desc: "Build consistency with daily streaks" },
  { icon: BarChart3, label: "Analytics", desc: "Track focus time and progress" },
];

export function LoginScreen() {
  const { signInWithGoogle } = useAuth();

  return (
    <div
      className="flex h-screen items-center justify-center p-4"
      style={{ background: "var(--bg-primary)" }}
    >
      <div className="flex flex-col lg:flex-row items-center gap-8 lg:gap-16 max-w-4xl w-full">
        {/* Left side - Login */}
        <div
          className="flex flex-col items-center gap-8 rounded-xl p-10 lg:p-12 w-full lg:w-auto lg:min-w-[380px]"
          style={{
            background: "var(--bg-secondary)",
            border: "1px solid var(--border-primary)",
            boxShadow: "var(--shadow-lg)",
          }}
        >
          {/* Logo */}
          <div className="flex items-center gap-3">
            <span
              className="text-3xl font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              Stride
            </span>
          </div>

          <div className="text-center space-y-2">
            <p
              className="text-sm"
              style={{ color: "var(--text-secondary)" }}
            >
              The system that gets out of your way.
            </p>
            <p
              className="text-xs"
              style={{ color: "var(--text-tertiary)" }}
            >
              For people with high standards for their time and even higher standards for their tools.
            </p>
          </div>

          <button
            onClick={signInWithGoogle}
            className="flex items-center justify-center gap-3 rounded-lg px-6 py-3 font-medium text-sm transition-colors bg-sage-400 text-white hover:bg-sage-500 w-full"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path
                d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
                fill="#4285F4"
              />
              <path
                d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.26c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"
                fill="#34A853"
              />
              <path
                d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
                fill="#FBBC05"
              />
              <path
                d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
                fill="#EA4335"
              />
            </svg>
            Sign in with Google
          </button>

          <p className="text-xs text-center" style={{ color: "var(--text-tertiary)" }}>
            Free to use. Your data stays in your own Firebase.
            <br />
            <a href="/privacy" className="underline hover:opacity-80" style={{ color: "var(--text-tertiary)" }}>
              Privacy Policy
            </a>
          </p>
        </div>

        {/* Right side - Feature highlights */}
        <div className="hidden lg:block w-full max-w-md">
          <h2 className="text-lg font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
            Less noise. More momentum.
          </h2>
          <p className="text-sm mb-6" style={{ color: "var(--text-tertiary)" }}>
            Focus sessions, task management, habit tracking, and more.
          </p>
          <div className="grid grid-cols-2 gap-3">
            {FEATURES.map(({ icon: Icon, label, desc }) => (
              <div
                key={label}
                className="rounded-lg p-3"
                style={{
                  background: "var(--bg-secondary)",
                  border: "1px solid var(--border-primary)",
                }}
              >
                <Icon size={18} style={{ color: "var(--accent)" }} className="mb-2" />
                <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                  {label}
                </p>
                <p className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>
                  {desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useAuth } from "@/lib/auth-context";

export function LoginScreen() {
  const { signInWithGoogle } = useAuth();

  return (
    <div
      className="flex h-screen items-center justify-center"
      style={{ background: "var(--bg-primary)" }}
    >
      <div
        className="flex flex-col items-center gap-8 rounded-xl p-12"
        style={{
          background: "var(--bg-secondary)",
          border: "1px solid var(--border-primary)",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500 text-white font-bold text-xl">
            L
          </div>
          <span
            className="text-3xl font-bold"
            style={{ color: "var(--text-primary)" }}
          >
            LifeOS
          </span>
        </div>

        <p
          className="text-center text-sm max-w-xs"
          style={{ color: "var(--text-secondary)" }}
        >
          Your personal operating system. One screen in the morning, one screen
          at night.
        </p>

        <button
          onClick={signInWithGoogle}
          className="flex items-center gap-3 rounded-lg px-6 py-3 font-medium text-sm transition-colors bg-emerald-500 text-white hover:bg-emerald-600"
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
      </div>
    </div>
  );
}

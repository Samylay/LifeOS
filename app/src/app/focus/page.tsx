import { Timer } from "lucide-react";

export default function FocusPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh]">
      {/* Timer Ring */}
      <div className="relative flex items-center justify-center mb-8">
        <svg width="200" height="200" viewBox="0 0 200 200">
          {/* Background ring */}
          <circle
            cx="100"
            cy="100"
            r="90"
            fill="none"
            stroke="var(--bg-tertiary)"
            strokeWidth="6"
          />
          {/* Progress ring */}
          <circle
            cx="100"
            cy="100"
            r="90"
            fill="none"
            stroke="var(--accent)"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={2 * Math.PI * 90}
            strokeDashoffset={0}
            transform="rotate(-90 100 100)"
          />
        </svg>
        <div className="absolute text-center">
          <span
            className="text-5xl font-bold font-mono tabular-nums"
            style={{ color: "var(--text-primary)" }}
          >
            25:00
          </span>
          <p
            className="text-xs uppercase tracking-widest font-medium mt-1"
            style={{ color: "var(--text-secondary)" }}
          >
            Focus
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex gap-4 mb-6">
        <button className="flex items-center gap-2 rounded-lg px-6 py-3 font-medium text-sm bg-emerald-500 text-white hover:bg-emerald-600 transition-colors">
          <Timer size={18} />
          Start Focus
        </button>
      </div>

      {/* Session Context */}
      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
        Session 1 of 4
      </p>
    </div>
  );
}

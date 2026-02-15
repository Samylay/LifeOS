import { LayoutDashboard, Flame, Target, Sword, Sun, Moon } from "lucide-react";

export default function Dashboard() {
  return (
    <div>
      <h1
        className="text-2xl font-semibold mb-6"
        style={{ color: "var(--text-primary)" }}
      >
        Command Center
      </h1>

      {/* Morning View Grid */}
      <div className="grid grid-cols-12 gap-6">
        {/* Today's Schedule */}
        <div
          className="col-span-12 lg:col-span-8 rounded-xl p-6"
          style={{
            background: "var(--bg-secondary)",
            border: "1px solid var(--border-primary)",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <div className="flex items-center gap-2 mb-4">
            <Sun size={20} style={{ color: "var(--accent)" }} />
            <h2
              className="text-lg font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              Today&apos;s Schedule
            </h2>
          </div>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Connect Google Calendar to see your schedule here.
          </p>
        </div>

        {/* Energy Check-in */}
        <div
          className="col-span-12 lg:col-span-4 rounded-xl p-6"
          style={{
            background: "var(--bg-secondary)",
            border: "1px solid var(--border-primary)",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <h2
            className="text-lg font-semibold mb-4"
            style={{ color: "var(--text-primary)" }}
          >
            Energy Check-in
          </h2>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium block mb-2" style={{ color: "var(--text-secondary)" }}>
                Sleep Quality
              </label>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-sm font-mono font-semibold transition-colors"
                    style={{
                      background: "var(--bg-tertiary)",
                      color: "var(--text-secondary)",
                    }}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium block mb-2" style={{ color: "var(--text-secondary)" }}>
                Energy Level
              </label>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-sm font-mono font-semibold transition-colors"
                    style={{
                      background: "var(--bg-tertiary)",
                      color: "var(--text-secondary)",
                    }}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Priority Tasks */}
        <div
          className="col-span-12 md:col-span-4 rounded-xl p-6"
          style={{
            background: "var(--bg-secondary)",
            border: "1px solid var(--border-primary)",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <div className="flex items-center gap-2 mb-4">
            <LayoutDashboard size={20} style={{ color: "var(--accent)" }} />
            <h2
              className="text-lg font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              Priority Tasks
            </h2>
          </div>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            No tasks yet. Use the capture bar to add your first task.
          </p>
        </div>

        {/* Focus Streak */}
        <div
          className="col-span-12 md:col-span-4 rounded-xl p-6"
          style={{
            background: "var(--bg-secondary)",
            border: "1px solid var(--border-primary)",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <div className="flex items-center gap-2 mb-4">
            <Flame size={20} style={{ color: "var(--accent)" }} />
            <h2
              className="text-lg font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              Focus Streak
            </h2>
          </div>
          <div className="text-center">
            <span
              className="text-4xl font-bold font-mono tabular-nums"
              style={{ color: "var(--accent)" }}
            >
              0
            </span>
            <p className="text-xs mt-1 uppercase tracking-wider font-medium" style={{ color: "var(--text-tertiary)" }}>
              Days
            </p>
          </div>
        </div>

        {/* Active Quests */}
        <div
          className="col-span-12 md:col-span-4 rounded-xl p-6"
          style={{
            background: "var(--bg-secondary)",
            border: "1px solid var(--border-primary)",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <div className="flex items-center gap-2 mb-4">
            <Target size={20} style={{ color: "var(--accent)" }} />
            <h2
              className="text-lg font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              Active Quests
            </h2>
          </div>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            No active quests. Create your first quarterly quest.
          </p>
        </div>

        {/* Hero Journeys */}
        <div
          className="col-span-12 lg:col-span-8 rounded-xl p-6"
          style={{
            background: "var(--bg-secondary)",
            border: "1px solid var(--border-primary)",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <div className="flex items-center gap-2 mb-4">
            <Sword size={20} style={{ color: "var(--accent)" }} />
            <h2
              className="text-lg font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              Hero Journeys
            </h2>
          </div>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Start a Hero Journey to track your long-term mastery.
          </p>
        </div>

        {/* Daily Brief */}
        <div
          className="col-span-12 lg:col-span-4 rounded-xl p-6"
          style={{
            background: "var(--bg-secondary)",
            border: "1px solid var(--border-primary)",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <div className="flex items-center gap-2 mb-4">
            <Moon size={20} style={{ color: "var(--accent)" }} />
            <h2
              className="text-lg font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              Daily Brief
            </h2>
          </div>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            AI-generated summary will appear here once the LLM is connected.
          </p>
        </div>
      </div>
    </div>
  );
}

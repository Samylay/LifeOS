import { Calendar } from "lucide-react";

export default function CalendarPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6" style={{ color: "var(--text-primary)" }}>
        Calendar
      </h1>

      <div
        className="flex flex-col items-center justify-center py-16 rounded-xl"
        style={{
          background: "var(--bg-secondary)",
          border: "1px solid var(--border-primary)",
        }}
      >
        <Calendar size={48} style={{ color: "var(--text-tertiary)" }} className="mb-4" />
        <p className="text-lg font-medium" style={{ color: "var(--text-primary)" }}>
          Calendar view
        </p>
        <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
          Connect Google Calendar in Settings to see your events here.
        </p>
      </div>
    </div>
  );
}

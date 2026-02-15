import { Heart, Briefcase, DollarSign, Megaphone, ClipboardList } from "lucide-react";
import Link from "next/link";

const AREAS = [
  { id: "health", name: "Health & Training", icon: Heart, color: "#14B8A6", href: "/areas/health" },
  { id: "career", name: "Career & Learning", icon: Briefcase, color: "#6366F1", href: "/areas/career" },
  { id: "finance", name: "Finance", icon: DollarSign, color: "#F59E0B", href: "/areas/finance" },
  { id: "brand", name: "Personal Brand", icon: Megaphone, color: "#8B5CF6", href: "/areas/brand" },
  { id: "admin", name: "Life Admin", icon: ClipboardList, color: "#64748B", href: "/areas/admin" },
];

export default function AreasPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6" style={{ color: "var(--text-primary)" }}>
        Life Areas
      </h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {AREAS.map((area) => {
          const Icon = area.icon;
          return (
            <Link
              key={area.id}
              href={area.href}
              className="group rounded-xl p-6 transition-all"
              style={{
                background: "var(--bg-secondary)",
                border: "1px solid var(--border-primary)",
                borderLeft: `3px solid ${area.color}`,
                boxShadow: "var(--shadow-sm)",
              }}
            >
              <div className="flex items-center gap-3 mb-4">
                <Icon size={24} style={{ color: area.color }} />
                <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
                  {area.name}
                </h2>
              </div>
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                View metrics, tasks, and habits for this area.
              </p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

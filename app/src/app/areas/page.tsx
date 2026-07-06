"use client";

import { Heart, Briefcase, DollarSign, Megaphone, ClipboardList, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { AREAS, type AreaId } from "@/lib/types";
import { useTasks } from "@/lib/use-tasks";
import { useProjects } from "@/lib/use-projects";
import { useReminders } from "@/lib/use-reminders";

const AREA_ORDER: AreaId[] = ["health", "career", "finance", "brand", "admin"];

const AREA_ICONS: Record<AreaId, LucideIcon> = {
  health: Heart,
  career: Briefcase,
  finance: DollarSign,
  brand: Megaphone,
  admin: ClipboardList,
};

const AREA_HEX: Record<AreaId, string> = {
  health: "#14B8A6",
  career: "#6366F1",
  finance: "#F59E0B",
  brand: "#8B5CF6",
  admin: "#64748B",
};

export default function AreasPage() {
  const { tasks } = useTasks();
  const { projects } = useProjects();
  const { reminders } = useReminders();

  const openTasks = tasks.filter((t) => t.status !== "done" && t.status !== "cancelled");
  const activeProjects = projects.filter((p) => p.status !== "completed" && p.status !== "archived");
  const openReminders = reminders.filter((r) => !r.completed);

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6" style={{ color: "var(--text-primary)" }}>
        Life Areas
      </h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {AREA_ORDER.map((id) => {
          const area = AREAS[id];
          const Icon = AREA_ICONS[id];
          const color = AREA_HEX[id];
          const taskCount = openTasks.filter((t) => t.area === id).length;
          const projectCount = activeProjects.filter((p) => p.area === id).length;
          const reminderCount = openReminders.filter((r) => r.area === id).length;

          const parts: string[] = [`${taskCount} open task${taskCount === 1 ? "" : "s"}`];
          if (projectCount > 0) parts.push(`${projectCount} active project${projectCount === 1 ? "" : "s"}`);
          if (reminderCount > 0) parts.push(`${reminderCount} reminder${reminderCount === 1 ? "" : "s"}`);

          return (
            <Link
              key={id}
              href={`/areas/${id}`}
              className="group rounded-xl p-6 transition-all"
              style={{
                background: "var(--bg-secondary)",
                border: "1px solid var(--border-primary)",
                borderLeft: `3px solid ${color}`,
                boxShadow: "var(--shadow-sm)",
              }}
            >
              <div className="flex items-center gap-3 mb-4">
                <Icon size={24} style={{ color }} />
                <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
                  {area.name}
                </h2>
              </div>
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                {parts.join(" · ")}
              </p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

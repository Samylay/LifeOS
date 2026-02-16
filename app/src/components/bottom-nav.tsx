"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Dumbbell,
  Droplets,
  Bell,
  BookOpen,
  Timer,
} from "lucide-react";

const TABS = [
  { href: "/", label: "Home", icon: LayoutDashboard },
  { href: "/workouts", label: "Workout", icon: Dumbbell },
  { href: "/focus", label: "Focus", icon: Timer },
  { href: "/reminders", label: "Reminders", icon: Bell },
  { href: "/reading", label: "Reading", icon: BookOpen },
];

export function BottomNav() {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 flex items-center justify-around lg:hidden"
      style={{
        height: 64,
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        background: "var(--bg-secondary)",
        borderTop: "1px solid var(--border-primary)",
        zIndex: 40,
      }}
    >
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const active = isActive(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className="flex flex-col items-center justify-center gap-0.5 py-1 px-3 rounded-lg transition-colors"
            style={{
              color: active ? "var(--accent)" : "var(--text-tertiary)",
              minWidth: 56,
            }}
          >
            <Icon size={22} strokeWidth={active ? 2.5 : 2} />
            <span
              className="text-xs font-medium"
              style={{ fontSize: 10 }}
            >
              {tab.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

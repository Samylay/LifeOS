"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { MOBILE_ITEMS, activeDestination } from "@/lib/navigation";

export function BottomNav() {
  const pathname = usePathname();
  const destination = activeDestination(pathname);
  const active = destination?.href;
  return (
    <nav aria-label="Quick navigation" className="app-bottomnav fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-border bg-card/95 px-2 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-md lg:hidden">
      {MOBILE_ITEMS.map((item) => (
        <Link key={item.href} href={item.href} aria-current={item.href === active ? "page" : undefined}
          className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg text-[11px] pressable transition-transform duration-[var(--dur-fast)] active:scale-[0.97] ${item.href === active ? "bg-accent text-foreground font-semibold" : "text-muted-foreground"}`}>
          <HugeiconsIcon icon={item.icon} size={20} strokeWidth={1.7} />{item.label}
        </Link>
      ))}
    </nav>
  );
}

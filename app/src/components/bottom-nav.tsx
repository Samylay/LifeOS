"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { useSidebar } from "@/components/ui/mira/sidebar";
import { MOBILE_ITEMS, Menu01Icon, activeDestination } from "@/lib/navigation";
import { cn } from "@/lib/utils";

export function BottomNav() {
  const pathname = usePathname();
  const { openMobile, setOpenMobile } = useSidebar();
  const destination = activeDestination(pathname);
  const active = pathname.startsWith("/decide/") ? "/decide" : destination?.href;
  const inMenu = !MOBILE_ITEMS.some((item) => item.href === active);
  return (
    <nav aria-label="Quick navigation" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-border bg-card/95 px-2 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-md lg:hidden">
      {MOBILE_ITEMS.map((item) => (
        <Link key={item.href} href={item.href} aria-current={item.href === active ? "page" : undefined}
          className={cn("flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg text-[11px] pressable active:scale-[0.97]", item.href === active ? "bg-accent text-foreground font-semibold" : "text-muted-foreground")}>
          <HugeiconsIcon icon={item.icon} size={20} strokeWidth={1.7} />{item.label}
        </Link>
      ))}
      <button type="button" aria-label="Open navigation" aria-expanded={openMobile} onClick={() => setOpenMobile(true)}
        className={cn("flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg text-[11px] pressable active:scale-[0.97]", inMenu ? "bg-accent text-foreground font-semibold" : "text-muted-foreground")}>
        <HugeiconsIcon icon={Menu01Icon} size={20} strokeWidth={1.7} />{inMenu ? destination?.label ?? "Menu" : "Menu"}
      </button>
    </nav>
  );
}

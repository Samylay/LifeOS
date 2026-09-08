import type { ReactNode } from "react";
import { ArrowUpRight, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function ActionEffect({ label, children, icon, className }: { label: string; children: ReactNode; icon?: ReactNode; className?: string }) {
  return <div className={cn("rounded-lg border border-border bg-muted/50 p-3", className)}>
    <div className="flex items-center gap-2 text-sm font-medium">{icon}{label}</div>
    <div className="mt-1 text-sm leading-relaxed text-muted-foreground">{children}</div>
  </div>;
}
export function ContextDetails({ children, label = "Details" }: { children: ReactNode; label?: string }) {
  return <details className="group/details border-t border-border pt-2">
    <summary className="flex min-h-9 items-center gap-1.5 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground pressable active:scale-[0.97]">
      <ChevronDown size={13} className="pressable group-open/details:rotate-180" />{label}
    </summary>
    <div className="space-y-3 py-2 text-sm [overflow-wrap:anywhere]">{children}</div>
  </details>;
}
export function Provenance({ label, href, children }: { label: string; href?: string; children?: ReactNode }) {
  return <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
    {href && /^https?:\/\//.test(href) ? <a href={href} target="_blank" rel="noreferrer" className="inline-flex min-h-8 items-center gap-1 underline-offset-4 hover:underline pressable active:scale-[0.97]">{label}<ArrowUpRight size={12} /></a> : <span>{label}</span>}
    {children}
  </div>;
}
export function Authorship({ generated = false }: { generated?: boolean }) {
  return <span className="text-xs font-medium text-muted-foreground">{generated ? "AI structure" : "Your words"}</span>;
}

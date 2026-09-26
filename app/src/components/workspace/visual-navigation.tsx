"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight, BookOpen, Brain, Clapperboard, CookingPot, Dumbbell, FolderKanban, Layers, Mic, Network, PenLine, Radar, Settings, Activity, Wallet, Newspaper, type LucideIcon } from "lucide-react";
import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetClose } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const areas: Record<string, { label: string; icon: LucideIcon; color: string; hint: string }> = {
  "/workflows": { label: "Workflows", icon: Layers, color: "var(--chart-5)", hint: "Review prepared results" },
  "/teaching": { label: "Teaching", icon: BookOpen, color: "var(--chart-2)", hint: "Build a curriculum" },
  "/decide": { label: "Decide", icon: Layers, color: "var(--chart-5)", hint: "Review saved material" },
  "/projects": { label: "Projects", icon: FolderKanban, color: "var(--chart-3)", hint: "Find the next step" },
  "/knowledge": { label: "Knowledge", icon: Brain, color: "var(--chart-2)", hint: "Explore and learn" },
  "/workouts": { label: "Training", icon: Dumbbell, color: "var(--chart-4)", hint: "Open your program" },
  "/recipes": { label: "Recipes", icon: CookingPot, color: "var(--chart-5)", hint: "Choose what to cook" },
  "/content": { label: "Content", icon: Clapperboard, color: "var(--chart-2)", hint: "Develop your ideas" },
  "/voice": { label: "Fluency", icon: Mic, color: "var(--chart-4)", hint: "Practice speaking" },
  "/essays": { label: "Essays", icon: PenLine, color: "var(--chart-2)", hint: "Practice writing" },
  "/finance": { label: "Finance", icon: Wallet, color: "var(--chart-3)", hint: "Follow your money" },
  "/mind-map": { label: "Mind map", icon: Network, color: "var(--chart-2)", hint: "Explore connections" },
  "/leads": { label: "Leads", icon: Radar, color: "var(--chart-5)", hint: "Find opportunities" },
  "/news": { label: "News", icon: Newspaper, color: "var(--chart-4)", hint: "Explore your sources" },
  "/status": { label: "Status", icon: Activity, color: "var(--chart-3)", hint: "Check your services" },
  "/settings": { label: "Settings", icon: Settings, color: "var(--muted-foreground)", hint: "Manage connections" },
};
const related: Record<string, string[]> = {
  "/workflows": ["/decide", "/knowledge", "/projects"], "/teaching": ["/knowledge", "/content", "/projects"],
  "/recipes": ["/workouts", "/decide"], "/workouts": ["/recipes", "/settings"],
  "/knowledge": ["/mind-map", "/teaching", "/essays", "/voice"], "/essays": ["/knowledge", "/voice", "/content"],
  "/voice": ["/essays", "/knowledge"], "/content": ["/decide", "/essays", "/projects"],
  "/projects": ["/mind-map", "/decide/approvals", "/status"], "/finance": ["/leads", "/settings"],
  "/news": ["/decide", "/knowledge"], "/feed": ["/decide", "/knowledge"],
  "/leads": ["/projects", "/finance"], "/status": ["/terminal", "/settings"],
  "/decide": ["/workflows", "/decide/dispatch", "/decide/approvals"],
  "/decide/dispatch": ["/decide", "/projects"], "/decide/extracts": ["/decide", "/knowledge"],
  "/decide/approvals": ["/projects", "/decide"], "/settings": ["/status", "/workouts"],
};
const extra: Record<string, { label: string; icon: LucideIcon }> = {
  "/decide/approvals": { label: "Approvals", icon: Layers }, "/decide/extracts": { label: "Extracts", icon: BookOpen },
  "/decide/dispatch": { label: "Results", icon: ArrowUpRight }, "/terminal": { label: "Terminal", icon: Activity },
};

/** Nearby destinations, not inferred relationships between the user's records. */
export function RelatedAreas() {
  const path = usePathname();
  const links = related[path];
  if (!links) return null;
  return <Sheet>
    <SheetTrigger asChild><button type="button" aria-label="Related pages" title="Related pages" className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted transition-transform duration-[var(--dur-fast)] ease-[var(--ease-out-custom)] active:scale-[0.97]"><ArrowUpRight size={18} /></button></SheetTrigger>
    <SheetContent side="bottom" className="mx-auto max-w-lg rounded-t-2xl pb-[max(1rem,env(safe-area-inset-bottom))]">
      <SheetHeader><SheetTitle>Related pages</SheetTitle><SheetDescription className="sr-only">Navigate to another LifeOS area.</SheetDescription></SheetHeader>
      <nav aria-label="Related areas" className="px-4">
        {links.map(href => { const a = areas[href] ?? extra[href]; const Icon = a.icon;
          return <SheetClose key={href} asChild><Link href={href} className="flex min-h-14 items-center gap-3 rounded-lg px-3 text-sm hover:bg-muted transition-transform duration-[var(--dur-fast)] ease-[var(--ease-out-custom)] active:scale-[0.97]"><Icon size={19} /><span className="flex-1">{a.label}</span><ArrowUpRight size={16} /></Link></SheetClose>;
        })}
      </nav>
    </SheetContent>
  </Sheet>;
}

export function WorkspaceMap() {
  return <nav className="workspace-map" aria-label="Explore LifeOS">
    <div className="workspace-map-center"><Network size={19} aria-hidden="true" /><span>Your workspace</span><Link href="/mind-map" className="pressable active:scale-[0.97]">Open mind map <ArrowUpRight size={12} /></Link></div>
    <div className="workspace-map-branches">
      {["/projects", "/knowledge", "/workouts", "/content", "/recipes", "/finance"].map((href) => {
        const a = areas[href]; const Icon = a.icon;
        return <Link href={href} key={href} className="workspace-node" style={{ "--node-color": a.color } as React.CSSProperties}>
          <span className="workspace-node-icon"><Icon size={19} strokeWidth={1.6} aria-hidden="true" /></span>
          <span><strong>{a.label}</strong><small>{a.hint}</small></span><ArrowUpRight size={13} className="ml-auto shrink-0 text-muted-foreground" aria-hidden="true" />
        </Link>;
      })}
    </div>
  </nav>;
}

export interface FlowOption { id: string; label: string; count?: number; icon?: LucideIcon }
/** Counts represent records in a state, never a completion score. */
export function FlowSelector({ label, options, value, onChange }: { label: string; options: FlowOption[]; value: string; onChange: (id: string) => void }) {
  return <div role="group" aria-label={label} className="flow-selector">
    {options.map((option) => {
      const Icon = option.icon;
      return <button type="button" key={option.id} aria-pressed={option.id === value} onClick={() => onChange(option.id)} className={cn("flow-option", option.id === value && "is-active")}>
        <span className="flow-option-node">{Icon ? <Icon size={17} aria-hidden="true" /> : <span className="size-2 rounded-full bg-current" />}</span>
        <span className="min-w-0"><span className="block text-sm font-medium">{option.label}</span>{option.count !== undefined && <span className="block font-mono text-xs text-muted-foreground">{option.count} {option.count === 1 ? "item" : "items"}</span>}</span>
      </button>;
    })}
  </div>;
}

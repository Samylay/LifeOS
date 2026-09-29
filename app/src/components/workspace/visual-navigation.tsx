"use client";

import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

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

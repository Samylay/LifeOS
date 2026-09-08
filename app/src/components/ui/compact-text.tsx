"use client";

import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/** A short scan of the original text, with an explicit route to every word. */
export function CompactText({ text, limit = 180, className }: { text?: string; limit?: number; className?: string }) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  if (!text || text === "none") return null;
  const clean = text.trim();
  const long = clean.length > limit;
  const end = long ? clean.lastIndexOf(" ", limit) : clean.length;
  const preview = clean.slice(0, end > limit / 2 ? end : limit).trimEnd();
  return (
    <div className={cn("min-w-0 text-sm leading-relaxed", className)}>
      <p id={id} className="whitespace-pre-wrap [overflow-wrap:anywhere]">{expanded || !long ? clean : `${preview}…`}</p>
      {long && <button type="button" aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded(!expanded)}
        className="mt-1 inline-flex min-h-8 items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground pressable active:scale-[0.97]">
        {expanded ? "Less" : "Read full text"}<ChevronDown size={12} className={cn("pressable", expanded && "rotate-180")} />
      </button>}
    </div>
  );
}

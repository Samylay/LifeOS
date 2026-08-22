"use client";

// Shared empty state (UI-MODERN-SPEC M6): icon in a soft tinted circle +
// a one-line muted hint + an optional action slot. Every list that can be
// empty renders this instead of ad-hoc paragraphs, so emptiness reads the
// same on every page.
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  icon: LucideIcon;
  /** Short headline above the hint (optional — the hint alone is fine). */
  title?: string;
  /** One line of guidance. */
  hint: string;
  /** Optional call to action (button / link) rendered under the hint. */
  action?: ReactNode;
  /** Compact variant for inline slots inside cards (no vertical padding). */
  compact?: boolean;
  className?: string;
}

export function EmptyState({ icon: Icon, title, hint, action, compact = false, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "gap-2 py-2" : "gap-3 py-12",
        className
      )}
    >
      <span
        className="flex items-center justify-center rounded-full text-muted-foreground"
        style={{
          width: compact ? 36 : 48,
          height: compact ? 36 : 48,
          background: "color-mix(in srgb, var(--accent-ui) 14%, transparent)",
        }}
        aria-hidden
      >
        <Icon size={compact ? 16 : 20} />
      </span>
      {title && <p className="text-sm font-medium text-foreground">{title}</p>}
      <p className="max-w-sm text-sm text-muted-foreground">{hint}</p>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

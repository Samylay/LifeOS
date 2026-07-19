"use client";

import { cn } from "@/lib/utils";

export interface ProgressBarProps {
  value: number;
  max?: number;
  label?: string;
  showValue?: boolean;
  valueFormatter?: (value: number, max: number) => string;
  color?: string;
  className?: string;
}

/** Thin labeled progress track — primary fill on a bg-secondary track. */
export function ProgressBar({
  value,
  max = 100,
  label,
  showValue = false,
  valueFormatter = (v, m) => `${v}/${m}`,
  color = "var(--primary)",
  className,
}: ProgressBarProps) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;

  return (
    <div className={cn("w-full", className)}>
      {(label || showValue) && (
        <div className="mb-1.5 flex items-center justify-between text-xs">
          {label && <span className="text-muted-foreground">{label}</span>}
          {showValue && <span className="font-medium tabular-nums">{valueFormatter(value, max)}</span>}
        </div>
      )}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full origin-left rounded-full transition-transform duration-300 ease-[var(--ease-out-custom)]"
          style={{ transform: `scaleX(${pct / 100})`, background: color }}
        />
      </div>
    </div>
  );
}

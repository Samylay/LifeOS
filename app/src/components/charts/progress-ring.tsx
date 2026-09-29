"use client";

import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface ProgressRingProps {
  value: number;
  goal: number;
  size?: number;
  label?: ReactNode;
  color?: string;
  strokeWidth?: number;
  className?: string;
}

/** Circular progress indicator with a compact value and label at its center. */
export function ProgressRing({
  value,
  goal,
  size = 112,
  label,
  color = "var(--primary)",
  strokeWidth = 8,
  className,
}: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = goal > 0 ? Math.min(1, Math.max(0, value / goal)) : 0;
  const offset = circumference * (1 - progress);
  const [strokeOffset, setStrokeOffset] = useState(circumference);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setStrokeOffset(offset));
    return () => cancelAnimationFrame(frame);
  }, [offset]);

  return (
    <div
      className={cn("relative inline-grid shrink-0 place-items-center", className)}
      style={{ width: size, height: size }}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={goal > 0 ? goal : 0}
      aria-valuenow={Math.min(Math.max(value, 0), Math.max(goal, 0))}
      aria-label={typeof label === "string" ? label : "Progress"}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--secondary)" strokeWidth={strokeWidth} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeOffset}
          className="progress-ring-stroke"
        />
      </svg>
      <span className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center leading-tight">
        <span className="text-xl font-semibold tabular-nums">{value}<span className="text-sm font-normal text-muted-foreground">/{goal}</span></span>
        {label != null && <span className="mt-1 max-w-[80%] truncate text-xs text-muted-foreground">{label}</span>}
      </span>
    </div>
  );
}

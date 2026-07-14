"use client";

import { useEffect, useRef, useState } from "react";

// Count-up for stat tiles (interaction-craft: "count-up numbers on stat
// tiles"). Animates 0 → value once on mount with an ease-out curve. Honors
// prefers-reduced-motion by jumping straight to the final value. Renders a
// plain number; wrap for suffixes/labels at the call site.
export function CountUp({
  value,
  duration = 700,
  className,
  suffix = "",
}: {
  value: number;
  duration?: number;
  className?: string;
  suffix?: string;
}) {
  // Start at 0 on both server and client so the animation counts up cleanly
  // from mount with no flash of the final value (and no hydration mismatch).
  const [display, setDisplay] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || value === 0) {
      setDisplay(value);
      return;
    }

    const start = performance.now();
    const from = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // ease-out cubic — matches --ease-out-custom's deceleration feel.
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + (value - from) * eased));
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [value, duration]);

  return (
    <span className={className} style={{ fontVariantNumeric: "tabular-nums" }}>
      {display}
      {suffix}
    </span>
  );
}

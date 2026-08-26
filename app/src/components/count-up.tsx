"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeToReducedMotion(onChange: () => void): () => void {
  const mediaQuery = window.matchMedia(REDUCED_MOTION_QUERY);
  mediaQuery.addEventListener("change", onChange);
  return () => mediaQuery.removeEventListener("change", onChange);
}

function getReducedMotionSnapshot(): boolean {
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

function getServerReducedMotionSnapshot(): boolean {
  return false;
}

// Count-up for stat tiles (interaction-craft: "count-up numbers on stat
// tiles"). Animates 0 → value once on mount with an ease-out curve. Honors
// prefers-reduced-motion by jumping straight to the final value. Renders a
// plain number; wrap for suffixes/labels at the call site.
export function CountUp({
  value,
  duration = 700,
  easePow = 3,
  className,
  suffix = "",
  format,
}: {
  value: number;
  duration?: number;
  // Ease-out power (Codrops "Animated Testimonial Hero" GSAP counter,
  // 2026-08-18: e = 1 - (1-p)^easePow). Higher = harder settle at the end.
  easePow?: number;
  className?: string;
  suffix?: string;
  // Optional formatter applied to each frame (e.g. formatDuration for
  // "3h 12m" tiles). Without it the value renders as a rounded integer.
  format?: (n: number) => string;
}) {
  const prefersReducedMotion = useSyncExternalStore(
    subscribeToReducedMotion,
    getReducedMotionSnapshot,
    getServerReducedMotionSnapshot
  );
  // Start at 0 on both server and client so the animation counts up cleanly
  // from mount with no flash of the final value (and no hydration mismatch).
  const [display, setDisplay] = useState(0);
  const rafRef = useRef<number | null>(null);
  // Track the last shown value: first mount counts up from 0, but later
  // value changes (e.g. polling refreshes) animate from the current number
  // instead of restarting at 0.
  const displayRef = useRef(0);
  const firstRef = useRef(true);

  useEffect(() => {
    if (prefersReducedMotion || value === 0) {
      displayRef.current = value;
      firstRef.current = false;
      return;
    }

    const start = performance.now();
    const from = firstRef.current ? 0 : displayRef.current;
    firstRef.current = false;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // ease-out(power) — matches --ease-out-custom's deceleration feel.
      const eased = 1 - Math.pow(1 - t, easePow);
      const next = Math.round(from + (value - from) * eased);
      displayRef.current = next;
      setDisplay(next);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [value, duration, easePow, prefersReducedMotion]);

  const visibleValue = prefersReducedMotion || value === 0 ? value : display;

  return (
    <span className={className} style={{ fontVariantNumeric: "tabular-nums" }}>
      {format ? format(visibleValue) : visibleValue}
      {suffix}
    </span>
  );
}

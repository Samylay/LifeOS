"use client";

import { useEffect, useState } from "react";

// Celebration (T38): rare-events-only flourish for goal-shipped and
// prime-completion moments. A sage check bursts in with a springy scale +
// fade — transform/opacity only, ≤400ms. Mount it conditionally; it removes
// itself after the animation and reports back via onDone so the parent can
// re-arm it. Skipped entirely under prefers-reduced-motion.
export function Celebration({ onDone }: { onDone?: () => void }) {
  const [gone, setGone] = useState(false);
  const [reduce, setReduce] = useState(true);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduce(mq.matches);
    if (mq.matches) return;
    const t = setTimeout(() => setGone(true), 500);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (gone) onDone?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gone]);

  if (gone || reduce) return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-50 grid place-items-center">
      {/* Single animated element: springy pop (scale+opacity) on the whole
          mark, then a quick fade as it lets go. */}
      <svg width="72" height="72" viewBox="0 0 72 72" className="celebrate-pop">
        <circle cx="36" cy="36" r="30" fill="var(--primary)" opacity="0.12" />
        <circle cx="36" cy="36" r="22" fill="none" stroke="var(--primary)" strokeWidth="2.5" />
        <path
          d="M26 37l7 7 13-15"
          fill="none"
          stroke="var(--primary)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

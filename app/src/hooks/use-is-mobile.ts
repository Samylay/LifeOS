"use client";

// Mobile detection for the T37 drawer split: on ≤768px viewports high-traffic
// surfaces render as Vaul bottom drawers; desktop keeps its existing inline UI
// pixel-identical. SSR-safe — starts false so server and first client paint
// agree, then syncs to the media query (a resize listener, not matchMedia
// change events alone, covers the initial hydration read).
import { useEffect, useState } from "react";

const QUERY = "(max-width: 768px)";

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return isMobile;
}

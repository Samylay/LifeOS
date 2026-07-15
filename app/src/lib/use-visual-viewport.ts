"use client";

import { useEffect, useState } from "react";

export type VisualViewport = {
  /** Height of the area actually visible to the user, in CSS px. */
  height: number;
  /** Offset of the visible area from the layout viewport's top, in CSS px. */
  offsetTop: number;
  /** True once a real measurement has landed (false during SSR/first paint). */
  ready: boolean;
};

/**
 * Tracks the *visual* viewport — the region a soft keyboard leaves visible.
 *
 * A mobile keyboard shrinks the visual viewport but, under the default
 * `interactive-widget: resizes-visual`, leaves the layout viewport (and so
 * `100vh`/`100dvh`) untouched. A `h-screen` fixed panel therefore keeps its
 * bottom edge underneath the keyboard. `interactive-widget: resizes-content`
 * fixes that on Android Chrome, but iOS Safari ignores the property entirely,
 * so measuring `window.visualViewport` is the only portable fix.
 *
 * Pin a full-height fixed panel with `top: offsetTop; height: height` to keep
 * a bottom-anchored composer on screen while the keyboard is open.
 */
export function useVisualViewport(): VisualViewport {
  const [state, setState] = useState<VisualViewport>({
    height: 0,
    offsetTop: 0,
    ready: false,
  });

  useEffect(() => {
    let frame = 0;
    const vv = window.visualViewport;
    if (!vv) {
      // No API (older browsers): fall back to the layout viewport, which is
      // what the pre-existing `h-screen` behaviour already assumed.
      frame = requestAnimationFrame(() =>
        setState({ height: window.innerHeight, offsetTop: 0, ready: true }),
      );
      return () => cancelAnimationFrame(frame);
    }

    const measure = () => {
      // Coalesce the burst of resize/scroll events iOS fires while the
      // keyboard animates in, so we lay out once per frame.
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        setState({ height: vv.height, offsetTop: vv.offsetTop, ready: true });
      });
    };

    measure();
    vv.addEventListener("resize", measure);
    vv.addEventListener("scroll", measure);
    return () => {
      cancelAnimationFrame(frame);
      vv.removeEventListener("resize", measure);
      vv.removeEventListener("scroll", measure);
    };
  }, []);

  return state;
}

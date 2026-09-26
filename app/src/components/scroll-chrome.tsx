"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/** Only content scrolling controls chrome. Scrolling a menu or sheet never does. */
export function ScrollChrome() {
  const pathname = usePathname();
  useEffect(() => {
    const root = document.documentElement;
    let previous = 0;
    let travel = 0;
    let lastTarget: EventTarget | null = null;
    let userScrollUntil = 0;
    root.dataset.chrome = "visible";
    const reveal = () => { root.dataset.chrome = "visible"; travel = 0; };
    const scroll = (event: Event) => {
      const target = event.target;
      const page = target === document;
      if (!page && (!(target instanceof HTMLElement) || !target.matches("[data-content-scroll]"))) return;
      const top = Math.max(0, page ? window.scrollY : (target as HTMLElement).scrollTop);
      if (target !== lastTarget) { previous = top; travel = 0; lastTarget = target; return; }
      const delta = top - previous;
      previous = top;
      // Restoring a conversation and streaming replies also scroll the page.
      // Only a reader's gesture should dismiss navigation.
      if (performance.now() > userScrollUntil) return;
      if (top < 24) { reveal(); return; }
      if (Math.sign(delta) !== Math.sign(travel)) travel = 0;
      travel += delta;
      if (travel > 24) root.dataset.chrome = "hidden";
      if (travel < -12) reveal();
    };
    const focus = (event: FocusEvent) => {
      reveal();
      const element = event.target;
      root.dataset.editing = element instanceof HTMLElement && element.matches("textarea, input:not([type=checkbox]):not([type=radio]), [contenteditable=true]") ? "true" : "false";
    };
    const blur = () => { root.dataset.editing = "false"; };
    const gesture = () => { userScrollUntil = performance.now() + 1500; };
    const key = (event: KeyboardEvent) => {
      if (["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End", " "].includes(event.key)) gesture();
      if (event.key === "Tab" || event.key === "Escape") reveal();
    };
    document.addEventListener("scroll", scroll, true);
    document.addEventListener("focusin", focus);
    document.addEventListener("focusout", blur);
    document.addEventListener("wheel", gesture, { passive: true });
    document.addEventListener("touchmove", gesture, { passive: true });
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("scroll", scroll, true);
      document.removeEventListener("focusin", focus);
      document.removeEventListener("focusout", blur);
      document.removeEventListener("wheel", gesture);
      document.removeEventListener("touchmove", gesture);
      document.removeEventListener("keydown", key);
      delete root.dataset.chrome;
      delete root.dataset.editing;
    };
  }, [pathname]);
  return null;
}

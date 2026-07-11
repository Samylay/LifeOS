"use client";

// PROTOTYPE — hand-rolled FLIP: a compact card expands into a full
// workspace overlay, morphing from the card's on-screen rect. Transform +
// opacity only; interruptible via CSS transitions; the global
// prefers-reduced-motion block kills it for users who ask.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { X } from "lucide-react";

interface Props {
  open: boolean;
  fromRect: DOMRect | null; // rect of the compact card at tap time
  onClose: () => void;
  children: React.ReactNode; // the workspace content
}

export function ExpandingWorkspace({ open, fromRect, onClose, children }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<"closed" | "from" | "open" | "closing">("closed");

  // Compute the transform that maps the full panel onto the compact card rect.
  const fromTransform = useCallback(() => {
    const panel = panelRef.current;
    if (!panel || !fromRect) return "none";
    const p = panel.getBoundingClientRect();
    const scaleX = fromRect.width / p.width;
    const scaleY = fromRect.height / p.height;
    const dx = fromRect.left - p.left;
    const dy = fromRect.top - p.top;
    return `translate(${dx}px, ${dy}px) scale(${scaleX}, ${scaleY})`;
  }, [fromRect]);

  useLayoutEffect(() => {
    if (open) {
      setPhase("from");
      // double rAF so the "from" transform paints before transitioning to identity
      requestAnimationFrame(() => requestAnimationFrame(() => setPhase("open")));
    } else if (phase === "open") {
      setPhase("closing");
      const t = setTimeout(() => setPhase("closed"), 320);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (phase === "open") {
      const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }
  }, [phase, onClose]);

  if (phase === "closed") return null;
  const atCard = phase === "from" || phase === "closing";

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
      <div className="absolute inset-0"
        onClick={onClose}
        style={{
          background: "rgba(0,0,0,0.4)",
          opacity: atCard ? 0 : 1,
          transition: "opacity var(--dur-slow) var(--ease-drawer)",
        }} />
      <div ref={panelRef}
        className="absolute inset-x-0 bottom-0 top-[max(env(safe-area-inset-top),2.5rem)] mx-auto max-w-lg overflow-y-auto rounded-t-2xl p-5 pb-[max(env(safe-area-inset-bottom),1.25rem)]"
        style={{
          background: "var(--bg-secondary)",
          transformOrigin: "top left",
          transform: atCard ? fromTransform() : "none",
          opacity: atCard ? 0.4 : 1,
          transition:
            "transform var(--dur-slow) var(--ease-drawer), opacity var(--dur-slow) var(--ease-drawer)",
          boxShadow: "0 -8px 40px rgba(0,0,0,0.25)",
        }}>
        <button onClick={onClose} aria-label="Close workspace"
          className="absolute right-4 top-4 rounded-full p-1.5 transition-transform duration-150 active:scale-[0.9]"
          style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}>
          <X size={16} />
        </button>
        <div style={{
          opacity: atCard ? 0 : 1,
          transition: "opacity var(--dur-base) var(--ease-out-custom)",
          transitionDelay: atCard ? "0ms" : "120ms",
        }}>
          {children}
        </div>
      </div>
    </div>
  );
}

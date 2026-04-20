"use client";

import { Sparkles, X } from "lucide-react";
import { TIER_NAMES } from "@/lib/types";
import type { TierUpEvent } from "@/lib/use-journeys";

export function TierUpCelebration({
  event,
  onClose,
}: {
  event: TierUpEvent;
  onClose: () => void;
}) {
  const fromName = TIER_NAMES[event.fromTier - 1];
  const toName = TIER_NAMES[event.toTier - 1];

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{
        background: "rgba(0,0,0,0.6)",
        zIndex: "var(--z-celebration, 80)",
      }}
      onClick={onClose}
    >
      <div
        className="relative rounded-2xl p-8 max-w-md w-full text-center"
        style={{ background: "var(--accent)", color: "white" }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-1.5 rounded-lg"
          style={{ color: "rgba(255,255,255,0.7)" }}
        >
          <X size={18} />
        </button>

        <div
          className="text-xs font-mono uppercase tracking-[0.3em] opacity-70 mb-1"
        >
          Tier Up · {event.journeyTitle}
        </div>

        <div className="my-8">
          <p className="text-sm opacity-80">from {fromName}</p>
          <p className="text-5xl font-bold mt-1 mb-2">{toName}</p>
          <p className="text-xs font-mono uppercase tracking-[0.2em] opacity-70">
            Tier {event.toTier} of 7
          </p>
        </div>

        <div className="flex justify-center mb-6">
          <div
            className="relative flex items-center justify-center rounded-full"
            style={{
              width: 100,
              height: 100,
              background: "rgba(255,255,255,0.15)",
            }}
          >
            <Sparkles size={40} />
          </div>
        </div>

        <button
          onClick={onClose}
          className="px-6 py-2.5 rounded-lg text-sm font-medium"
          style={{ background: "rgba(255,255,255,0.2)", color: "white" }}
        >
          Keep going
        </button>
      </div>
    </div>
  );
}

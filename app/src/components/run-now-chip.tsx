"use client";

// The per-action NEEDS-SAMY bypass confirm. When Samy explicitly told the
// agent "run it now", queue_homelab_prompt marks the queued doc and the
// result carries confirm:{promptId} — this chip is the ONLY thing that turns
// that request into a launch (POST /api/triage/dispatch {promptId}). The tap
// in the tailnet-only UI is the trust anchor, so model output (or an injected
// transcript) can never start a session by itself (T47 stays closed).
import { useState } from "react";
import { Loader2, Play, Rocket } from "lucide-react";
import { cn } from "@/lib/utils";

export function RunNowChip({ promptId, title }: { promptId: string; title: string }) {
  const [state, setState] = useState<"idle" | "launching" | "launched" | "failed">("idle");

  const launch = async () => {
    if (state === "launching" || state === "launched") return;
    setState("launching");
    try {
      const res = await fetch("/api/triage/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ promptId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
      setState("launched");
    } catch {
      setState("failed");
    }
  };

  if (state === "launched") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
        <Rocket size={11} /> Launched
      </span>
    );
  }

  return (
    <button
      onClick={launch}
      disabled={state === "launching"}
      aria-label={`Run "${title}" now`}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold transition-transform duration-150 active:scale-[0.95]",
        state === "failed"
          ? "bg-destructive/10 text-destructive"
          : "bg-primary text-primary-foreground"
      )}
    >
      {state === "launching" ? <Loader2 size={11} className="animate-spin" /> : <Play size={11} />}
      {state === "failed" ? "Failed — retry" : "Run now"}
    </button>
  );
}

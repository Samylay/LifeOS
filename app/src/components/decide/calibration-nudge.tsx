"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
export function CalibrationNudge() {
  const [state, setState] = useState<{ answered: number; target: number } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const load = () => { void fetch("/api/triage/calibration", { signal: controller.signal }).then(r => r.ok ? r.json() : null).then(setState).catch(() => {}); };
    load(); const timer = setInterval(load, 60000);
    window.addEventListener("lifeos-calibration", load);
    return () => { controller.abort(); clearInterval(timer); window.removeEventListener("lifeos-calibration", load); };
  }, []);
  if (!state) return null;
  return <Link href="/decide/calibrate" className="flex min-h-16 items-center justify-between gap-4 rounded-xl border border-primary/25 bg-primary/5 p-4 transition-transform duration-[var(--dur-fast)] ease-[var(--ease-out-custom)] active:scale-[0.97]">
    <span><span className="block text-sm font-medium">{state.answered >= state.target ? "Your corrections are shaping LifeOS" : "Teach LifeOS what matters to you"}</span><span className="mt-1 block text-xs text-muted-foreground">{state.answered >= state.target ? "Today’s review is covered. More is optional." : "Three quick interpretations. About two minutes."}</span></span>
    <span className="shrink-0 text-sm font-medium text-primary">{Math.min(state.answered, state.target)}/{state.target}</span>
  </Link>;
}

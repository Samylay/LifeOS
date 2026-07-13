"use client";

// VoicePal — capture-first home. Opening the page = ready to talk: the mic is
// the dominant control, zero navigation between intent and speaking. Tapping it
// spins up a fresh capture and drops straight into the session. Recent captures
// and the "Edit presets" affordance live below the fold.
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Mic, Loader2, SlidersHorizontal, FileText, CheckCircle2 } from "lucide-react";
import { useToast } from "@/components/toast";
import { PresetsModal } from "@/components/voice/presets-modal";

interface Capture {
  id: string;
  title: string;
  status: "live" | "ended" | "routed";
  transformFormat?: string;
}

export default function VoiceHome() {
  const router = useRouter();
  const { toast } = useToast();
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [presetsOpen, setPresetsOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/voicepal");
      const data = await res.json();
      setCaptures(data.captures || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const startCapture = async () => {
    setStarting(true);
    try {
      const res = await fetch("/api/voicepal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start" }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
      router.push(`/voice/${data.id}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "couldn't start a capture", "error");
      setStarting(false);
    }
  };

  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col px-4 pb-6">
      <div className="enter flex items-center justify-between py-4">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
            Voice
          </h1>
          <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
            Talk it out. It asks. You answer. Then it drafts.
          </p>
        </div>
        <button
          onClick={() => setPresetsOpen(true)}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-transform duration-150 active:scale-[0.97]"
          style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}
        >
          <SlidersHorizontal size={14} /> Presets
        </button>
      </div>

      {/* Capture-first hero: the big mic */}
      <div
        className="enter flex flex-col items-center justify-center gap-4 rounded-2xl py-12"
        style={{ background: "var(--bg-secondary)", "--enter-delay": "40ms" } as React.CSSProperties}
      >
        <button
          onClick={startCapture}
          disabled={starting}
          aria-label="Start a new capture"
          className="flex h-24 w-24 items-center justify-center rounded-full transition-transform active:scale-[0.94]"
          style={{
            background: "var(--accent)",
            color: "white",
            transitionDuration: "var(--duration-fast)",
            transitionTimingFunction: "var(--ease-out-custom)",
            opacity: starting ? 0.6 : 1,
            boxShadow: "0 12px 32px -12px var(--accent)",
          }}
        >
          {starting ? <Loader2 size={34} className="animate-spin" /> : <Mic size={38} />}
        </button>
        <p className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
          {starting ? "Opening…" : "Tap and just talk"}
        </p>
      </div>

      {/* Recent captures */}
      <div className="mt-8 flex-1 overflow-y-auto">
        <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>
          Recent
        </h2>
        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton-pulse h-14 rounded-xl" style={{ background: "var(--bg-secondary)" }} />
            ))}
          </div>
        ) : captures.length === 0 ? (
          <p className="px-1 py-8 text-center text-sm" style={{ color: "var(--text-tertiary)" }}>
            Nothing captured yet — tap the mic and start a thought.
          </p>
        ) : (
          <ul className="space-y-2">
            {captures.map((c, i) => {
              const done = c.status === "routed";
              return (
                <li key={c.id}>
                  <button
                    onClick={() => router.push(`/voice/${c.id}`)}
                    className="hover-lift enter flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition-transform active:scale-[0.99]"
                    style={{
                      background: "var(--bg-secondary)",
                      border: "1px solid var(--border-primary)",
                      "--enter-delay": `${Math.min(i, 8) * 30}ms`,
                    } as React.CSSProperties}
                  >
                    <span className="shrink-0" style={{ color: done ? "var(--accent)" : "var(--text-tertiary)" }}>
                      {done ? <CheckCircle2 size={18} /> : <FileText size={18} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                        {c.title}
                      </span>
                      <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                        {c.status === "live" ? "in progress" : c.status === "routed" ? "filed to vault" : "ended"}
                        {c.transformFormat ? ` · ${c.transformFormat}` : ""}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <PresetsModal open={presetsOpen} onClose={() => setPresetsOpen(false)} />
    </div>
  );
}

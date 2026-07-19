"use client";

// Live voice teaching session — capture-first (VoicePal): the mic is the
// screen's dominant control; Samy talks, the tutor answers with 2-3
// follow-up questions to keep him talking. Every turn is already persisted
// server-side by the time it renders here; closing the tab mid-session
// loses nothing (the sweep routes it to Hermes).
import { use, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, GraduationCap, Loader2, Mic, Square } from "lucide-react";
import { useVoiceRecorder } from "@/lib/use-voice-recorder";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Turn {
  id: string;
  idx: number;
  role: "learner" | "tutor";
  text: string;
  followUps?: string[];
}

export default function TeachSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { toast } = useToast();
  const [topic, setTopic] = useState("");
  const [status, setStatus] = useState<"live" | "ended" | "routed" | "loading">("loading");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [ending, setEnding] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/teach/session/${id}`);
    if (!res.ok) {
      toast("Session not found", "error");
      router.push("/knowledge");
      return;
    }
    const data = await res.json();
    setTopic(data.session.topic);
    setStatus(data.session.status);
    setTurns(data.turns);
  }, [id, router, toast]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns.length]);

  const voice = useVoiceRecorder({
    endpoint: `/api/teach/session/${id}`,
    onResponse: async (data) => {
      setTurns((prev) => [
        ...prev,
        { id: `l${prev.length}`, idx: prev.length, role: "learner", text: String(data.transcript) },
        {
          id: `t${prev.length + 1}`,
          idx: prev.length + 1,
          role: "tutor",
          text: String(data.text),
          followUps: (data.followUps as string[]) || [],
        },
      ]);
    },
    onTranscript: () => {},
    onError: (m) => toast(m, "error"),
  });

  const end = async () => {
    setEnding(true);
    try {
      const res = await fetch(`/api/teach/session/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "end" }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
      toast("Session filed to the vault — Hermes will enrich it", "success");
      router.push("/knowledge");
    } catch (e) {
      toast(e instanceof Error ? e.message : "couldn't end the session", "error");
      setEnding(false);
    }
  };

  const busy = voice.state === "transcribing";

  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col px-4 pb-6">
      <div className="flex items-center gap-3 py-4">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => router.push("/knowledge")}
          aria-label="Back to knowledge"
          className="text-muted-foreground"
        >
          <ArrowLeft size={18} />
        </Button>
        <GraduationCap size={18} className="text-primary" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold text-foreground">{topic || "…"}</h1>
          <p className="text-xs text-muted-foreground/70">Teaching session · {status}</p>
        </div>
        {status === "live" && (
          <Button
            variant="secondary"
            size="sm"
            onClick={end}
            disabled={ending}
            className="text-xs"
          >
            {ending ? "Filing…" : "End session"}
          </Button>
        )}
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto py-2">
        {turns.map((t) => (
          <div
            key={t.id}
            className={cn(
              "max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed text-foreground",
              t.role === "learner" ? "ml-auto bg-primary/10" : "bg-card"
            )}
          >
            {t.text}
            {t.role === "tutor" && (t.followUps?.length ?? 0) > 0 && (
              <ul className="mt-2 space-y-1">
                {t.followUps!.map((q, i) => (
                  <li key={i} className="text-xs text-muted-foreground">
                    → {q}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
        {busy && (
          <div className="flex w-fit items-center gap-2 rounded-2xl bg-card px-4 py-3 text-xs text-muted-foreground/70">
            <Loader2 size={13} className="animate-spin" /> listening back…
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {status === "live" && (
        <div className="flex justify-center pb-2 pt-4">
          <button
            onClick={voice.state === "recording" ? voice.stop : voice.start}
            disabled={busy}
            aria-label={voice.state === "recording" ? "Stop recording" : "Start talking"}
            className={cn(
              "flex h-20 w-20 items-center justify-center rounded-full text-white transition-transform duration-150 [transition-timing-function:var(--ease-out-custom)] active:scale-[0.94]",
              voice.state === "recording" ? "bg-destructive" : "bg-primary",
              busy && "opacity-50"
            )}
          >
            {voice.state === "recording" ? (
              <Square size={26} fill="currentColor" className="animate-pulse" />
            ) : busy ? (
              <Loader2 size={28} className="animate-spin" />
            ) : (
              <Mic size={30} />
            )}
          </button>
        </div>
      )}
      {status === "live" && (
        <p className="pb-1 text-center text-xs text-muted-foreground/70">
          {voice.state === "recording" ? "tap to finish your thought" : "tap and just talk"}
        </p>
      )}
    </div>
  );
}

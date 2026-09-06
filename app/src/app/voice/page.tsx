"use client";

// The one-step capture hub (spec.md ticket 02): tap, talk, see what whisper
// heard, tap to commit. Nothing to start, nothing to end, no format or
// destination to pick — the old VoicePal capture-session model (start/end,
// transform presets, Shadow Reader follow-ups, a model-written draft) is
// gone entirely. Removing the draft is not an ergonomic cut: that transform
// step generated prose Samy would publish, a house-law violation.
//
// Durability is unchanged: audio hits the data volume before whisper runs
// and the raw transcript is stashed before it ever reaches this screen
// (voice-stash.ts, T46) — recording, transcribing, and reviewing all reuse
// that path via /api/voice and /api/voice/save exactly as the brief's talk
// card and the Assistant's capture tool already do.
//
// On commit the routing module (voice-routing.ts, ticket 01) decides the
// destination. The vault note is byte-for-byte the same layout
// appendToInbox has always produced; Todoist and the idea bank (ticket 03)
// each reuse the writer that already owns that collection. /decide gets its
// writer in ticket 04 — until then a spoken decision still lands in the
// vault, same as every capture did before this ticket.
import { useCallback, useEffect, useState } from "react";
import { Check, FileText, Loader2, Mic, Square, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useVoiceRecorder } from "@/lib/use-voice-recorder";
import { useToast } from "@/components/toast";
import { Page, PageHeader, SectionHeader } from "@/components/ui/page";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { calendarDaysBetween } from "@/lib/types";

interface RecentCapture {
  id: string;
  transcript: string;
  destination: string;
  vaultPath?: string;
  createdAt?: unknown;
}

function timeAgo(v: unknown): string {
  const ms =
    typeof v === "string"
      ? Date.parse(v)
      : v && typeof v === "object" && "__date" in (v as object)
        ? Date.parse((v as { __date: string }).__date)
        : NaN;
  if (Number.isNaN(ms)) return "";
  const days = calendarDaysBetween(new Date(ms), new Date());
  if (days > 0) return `${days}d ago`;
  const d = Date.now() - ms;
  const hrs = Math.floor(d / 3600000);
  if (hrs > 0) return `${hrs}h ago`;
  const mins = Math.floor(d / 60000);
  return mins > 0 ? `${mins}m ago` : "just now";
}

// Keyed off what actually happened, not what the classifier guessed — a
// route() call can name "decide" (no writer until ticket 04) but the save
// route only ever reports a destination it actually wrote to, so a
// not-yet-wired guess never claims a landing that didn't happen.
function destinationLabel(destination: string): string {
  switch (destination) {
    case "vault":
      return "Vault note";
    case "idea-bank":
      return "Idea bank";
    case "todoist":
      return "Todoist";
    default:
      return destination;
  }
}

const EASE = {
  transitionDuration: "var(--dur-fast)",
  transitionTimingFunction: "var(--ease-out-custom)",
} as const;

export default function VoiceHome() {
  const { toast } = useToast();
  const [transcript, setTranscript] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [recent, setRecent] = useState<RecentCapture[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(true);
  const [elapsed, setElapsed] = useState(0);

  const loadRecent = useCallback(async () => {
    try {
      const res = await fetch("/api/voice/recent");
      const data = await res.json();
      setRecent(data.captures || []);
    } finally {
      setLoadingRecent(false);
    }
  }, []);

  useEffect(() => {
    loadRecent();
  }, [loadRecent]);

  const voice = useVoiceRecorder({
    endpoint: "/api/voice",
    onResponse: (data) => {
      setTranscript(String(data.transcript ?? ""));
      setPendingId(typeof data.pendingId === "string" ? data.pendingId : null);
      setReviewing(true);
    },
    onTranscript: () => {},
    onError: (m) => toast(m, "error"),
  });

  // Elapsed mm:ss while recording — feedback that the mic is actually live.
  useEffect(() => {
    if (voice.state !== "recording") {
      setElapsed(0);
      return;
    }
    const t0 = Date.now();
    const iv = setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 500);
    return () => clearInterval(iv);
  }, [voice.state]);
  const mmss = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`;

  const discard = () => {
    setTranscript("");
    setPendingId(null);
    setReviewing(false);
  };

  const commit = async () => {
    const text = transcript.trim();
    if (!text) {
      toast("Nothing to file — the transcript is empty", "error");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/voice/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: text,
          category: "capture",
          pendingId: pendingId ?? undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
      toast(`Filed to ${destinationLabel(String(data.destination)).toLowerCase()}`, "success");
      discard();
      loadRecent();
    } catch (e) {
      toast(e instanceof Error ? e.message : "couldn't file the capture", "error");
    } finally {
      setSaving(false);
    }
  };

  const busy = voice.state === "transcribing";

  return (
    <Page narrow className="flex min-h-full flex-col">
      <PageHeader
        kicker="Voice"
        title="Voice"
        description="Tap, talk, and it's already filed."
        icon={Mic}
      />

      {!reviewing ? (
        <div
          className="work-canvas enter flex flex-col items-center justify-center gap-4 py-12"
          style={{ "--enter-delay": "40ms" } as React.CSSProperties}
        >
          <button
            onClick={voice.state === "recording" ? voice.stop : voice.start}
            disabled={busy}
            aria-label={voice.state === "recording" ? "Stop recording" : "Start talking"}
            className={cn(
              "flex h-24 w-24 items-center justify-center rounded-full text-white transition-transform active:scale-[0.94]",
              voice.state === "recording" ? "bg-destructive" : "bg-primary"
            )}
            style={{
              ...EASE,
              opacity: busy ? 0.6 : 1,
              boxShadow: `0 12px 32px -12px var(${voice.state === "recording" ? "--destructive" : "--primary"})`,
            }}
          >
            {voice.state === "recording" ? (
              <Square size={30} fill="currentColor" className="animate-pulse" />
            ) : busy ? (
              <Loader2 size={34} className="animate-spin" />
            ) : (
              <Mic size={38} />
            )}
          </button>
          {voice.state === "recording" && (
            <button
              onClick={voice.cancel}
              aria-label="Discard recording"
              className="enter flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-transform active:scale-[0.92]"
              style={EASE}
            >
              <X size={18} />
            </button>
          )}
          <p className="text-sm font-medium text-muted-foreground">
            {voice.state === "recording"
              ? `${mmss} · tap to finish, ✕ to discard`
              : busy
                ? "Listening back…"
                : "Tap and just talk"}
          </p>
        </div>
      ) : (
        <div className="enter space-y-3 py-6" style={{ "--enter-delay": "20ms" } as React.CSSProperties}>
          <Textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            rows={6}
            autoFocus
            className="w-full text-sm"
          />
          <div className="flex items-center gap-2">
            <Button
              onClick={commit}
              disabled={saving}
              size="sm"
              className="gap-1.5 text-sm font-medium transition-transform active:scale-[0.97]"
              style={EASE}
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              {saving ? "Filing…" : "File it"}
            </Button>
            <Button
              onClick={discard}
              disabled={saving}
              variant="secondary"
              size="sm"
              className="text-sm font-medium transition-transform active:scale-[0.97]"
              style={EASE}
            >
              Discard &amp; re-record
            </Button>
          </div>
        </div>
      )}

      {/* Recent captures */}
      <div className="mt-8 flex-1 overflow-y-auto">
        <SectionHeader title="Recent" description="Where the last few captures landed." />
        {loadingRecent ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="shimmer h-14 rounded-xl bg-card" />
            ))}
          </div>
        ) : recent.length === 0 ? (
          <p className="px-1 py-8 text-center text-sm text-muted-foreground">
            Nothing captured yet — tap the mic and start a thought.
          </p>
        ) : (
          <ul className="space-y-2">
            {recent.map((c, i) => (
              <li
                key={c.id}
                className="hover-lift enter flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3"
                style={{ "--enter-delay": `${Math.min(i, 8) * 30}ms` } as React.CSSProperties}
              >
                <span className="shrink-0 text-primary">
                  <FileText size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {c.transcript}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {destinationLabel(c.destination)}
                    {timeAgo(c.createdAt) ? ` · ${timeAgo(c.createdAt)}` : ""}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Page>
  );
}

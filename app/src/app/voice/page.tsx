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
// destination. All four are real now: the vault note is byte-for-byte the
// layout appendToInbox has always produced, Todoist and the idea bank each
// reuse the writer that already owns that collection, and /decide files a
// card into the same deck as everything else — never free text handed to an
// agent.
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, FileText, Loader2, Mic, RotateCcw, Square, X } from "lucide-react";
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

// T-voice-rework-05 — a take that hasn't landed anywhere yet: either it
// never got past review (status "pending", or a destination write failed
// without confirming — /api/voice/save deliberately leaves the row pending
// on a write failure) or the transcription itself failed (status "failed",
// only the audio is recoverable). Fetched alongside `captures` from the same
// GET so the recent list can render both as one merged, sorted list — the
// spec's "the same list is where failed and interrupted takes come back."
interface RecoverableTake {
  id: string;
  status: "pending" | "failed";
  transcript: string;
  error?: string;
  hasAudio: boolean;
  createdAt?: unknown;
}

const ALL_DESTINATIONS = [
  { value: "vault", label: "Vault note" },
  { value: "idea-bank", label: "Idea bank" },
  { value: "todoist", label: "Todoist" },
  { value: "decide", label: "Decide" },
] as const;

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
// save route only ever reports a destination it actually wrote to, so the
// label can never claim a landing that did not happen. An unrecognised name
// falls through to the raw string rather than a confident-sounding label.
function destinationLabel(destination: string): string {
  switch (destination) {
    case "vault":
      return "Vault note";
    case "idea-bank":
      return "Idea bank";
    case "todoist":
      return "Todoist";
    case "decide":
      return "Decide card";
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
  const [recoverable, setRecoverable] = useState<RecoverableTake[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  // Which row's destination picker is expanded — one at a time, keyed by id.
  const [openMover, setOpenMover] = useState<string | null>(null);
  // ids currently mid-flight for a reroute/retry/discard, so the row can show
  // its own spinner instead of freezing the whole list.
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  const loadRecent = useCallback(async () => {
    try {
      const res = await fetch("/api/voice/recent");
      const data = await res.json();
      setRecent(data.captures || []);
      setRecoverable(data.recoverable || []);
    } finally {
      setLoadingRecent(false);
    }
  }, []);

  const withBusy = useCallback(async (id: string, fn: () => Promise<void>) => {
    setBusyIds((prev) => new Set(prev).add(id));
    try {
      await fn();
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }, []);

  // A wrong guess costs one tap: reroute works for both a landed capture
  // (the old copy is best-effort retracted by the API) and a never-landed
  // pending take (this is simply its first filing). Same endpoint either
  // way — the recent list never needs to know which case it is.
  const moveTo = useCallback(
    (id: string, destination: string) =>
      withBusy(id, async () => {
        setOpenMover(null);
        try {
          const res = await fetch(`/api/voice/recent/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "reroute", destination }),
          });
          const data = await res.json();
          if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
          toast(`Filed to ${destinationLabel(destination).toLowerCase()}`, "success");
          loadRecent();
        } catch (e) {
          toast(e instanceof Error ? e.message : "couldn't move that capture", "error");
        }
      }),
    [withBusy, toast, loadRecent],
  );

  const retryTranscription = useCallback(
    (id: string) =>
      withBusy(id, async () => {
        try {
          const res = await fetch(`/api/voice/recent/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "retry-transcription" }),
          });
          const data = await res.json();
          if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
          toast("Transcribed — pick a destination below", "success");
          loadRecent();
        } catch (e) {
          toast(e instanceof Error ? e.message : "still couldn't transcribe that one", "error");
        }
      }),
    [withBusy, toast, loadRecent],
  );

  const discardTake = useCallback(
    (id: string) =>
      withBusy(id, async () => {
        try {
          const res = await fetch(`/api/voice/recent/${id}`, { method: "DELETE" });
          const data = await res.json();
          if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
          setRecoverable((prev) => prev.filter((r) => r.id !== id));
        } catch (e) {
          toast(e instanceof Error ? e.message : "couldn't discard that one", "error");
        }
      }),
    [withBusy, toast],
  );

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
        description="Speak a thought. See where it lands."
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

      {/* Recent — landed captures and anything still recoverable, one list
          with an exit for every entry (spec.md ticket 05): a wrong guess
          moves in a tap, a failed take retries, nothing sits here forever. */}
      <div className="mt-8 flex-1 overflow-y-auto">
        <SectionHeader title="Recent" description="Recent captures. Tap to correct a destination." />
        {loadingRecent ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="shimmer h-14 rounded-xl bg-card" />
            ))}
          </div>
        ) : recent.length === 0 && recoverable.length === 0 ? (
          <p className="px-1 py-8 text-center text-sm text-muted-foreground">
            Nothing captured yet — tap the mic and start a thought.
          </p>
        ) : (
          <ul className="space-y-2">
            {recoverable.map((r, i) => {
              const isBusy = busyIds.has(r.id);
              const isOpen = openMover === r.id;
              return (
                <li
                  key={r.id}
                  className="enter overflow-hidden rounded-xl border border-dashed border-border bg-card px-4 py-3"
                  style={{ "--enter-delay": `${Math.min(i, 8) * 30}ms` } as React.CSSProperties}
                >
                  <div className="flex items-center gap-3">
                    <span className="shrink-0 text-amber-500">
                      <AlertTriangle size={18} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {r.transcript || "(transcription failed)"}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {r.status === "failed" ? r.error || "Transcription failed" : "Never filed — pick a destination"}
                        {timeAgo(r.createdAt) ? ` · ${timeAgo(r.createdAt)}` : ""}
                      </span>
                    </span>
                    {r.status === "failed" ? (
                      <button
                        onClick={() => retryTranscription(r.id)}
                        disabled={isBusy || !r.hasAudio}
                        aria-label="Retry transcription"
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border text-foreground transition-transform active:scale-[0.92] disabled:opacity-40"
                        style={EASE}
                      >
                        {isBusy ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                      </button>
                    ) : (
                      <button
                        onClick={() => setOpenMover(isOpen ? null : r.id)}
                        disabled={isBusy}
                        className="shrink-0 rounded-full border border-border px-3 py-1 text-xs font-medium text-foreground transition-transform active:scale-[0.95] disabled:opacity-40"
                        style={EASE}
                      >
                        {isBusy ? <Loader2 size={14} className="animate-spin" /> : "File it"}
                      </button>
                    )}
                    <button
                      onClick={() => discardTake(r.id)}
                      disabled={isBusy}
                      aria-label="Discard this take"
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-transform active:scale-[0.92] disabled:opacity-40"
                      style={EASE}
                    >
                      <X size={14} />
                    </button>
                  </div>
                  {isOpen && (
                    <div
                      className="enter mt-3 flex flex-wrap gap-1.5"
                      style={{ "--enter-delay": "0ms" } as React.CSSProperties}
                    >
                      {ALL_DESTINATIONS.map((d) => (
                        <button
                          key={d.value}
                          onClick={() => moveTo(r.id, d.value)}
                          className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground transition-transform active:scale-[0.95]"
                          style={EASE}
                        >
                          {d.label}
                        </button>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
            {recent.map((c, i) => {
              const isBusy = busyIds.has(c.id);
              const isOpen = openMover === c.id;
              const otherDestinations = ALL_DESTINATIONS.filter((d) => d.value !== c.destination);
              return (
                <li
                  key={c.id}
                  className="hover-lift enter overflow-hidden rounded-xl border border-border bg-card px-4 py-3"
                  style={{ "--enter-delay": `${Math.min(i, 8) * 30}ms` } as React.CSSProperties}
                >
                  <button
                    onClick={() => setOpenMover(isOpen ? null : c.id)}
                    disabled={isBusy}
                    className="flex w-full items-center gap-3 text-left disabled:opacity-60"
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
                    {isBusy && <Loader2 size={14} className="shrink-0 animate-spin text-muted-foreground" />}
                  </button>
                  {isOpen && (
                    <div
                      className="enter mt-3 flex flex-wrap gap-1.5 border-t border-border pt-3"
                      style={{ "--enter-delay": "0ms" } as React.CSSProperties}
                    >
                      <span className="w-full text-xs text-muted-foreground">Move to:</span>
                      {otherDestinations.map((d) => (
                        <button
                          key={d.value}
                          onClick={() => moveTo(c.id, d.value)}
                          disabled={isBusy}
                          className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground transition-transform active:scale-[0.95] disabled:opacity-40"
                          style={EASE}
                        >
                          {d.label}
                        </button>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Page>
  );
}

"use client";

// A VoicePal capture session — the core loop. Samy talks (the mic is the
// dominant control); the Shadow Reader answers each utterance with 2–3
// interview-style follow-ups to keep him going. When he's said enough, one tap
// TRANSFORMS the whole stream through a preset into a first draft in his voice.
// Finishing files the transcript + draft to the vault (Hermes intake).
//
// No-loss: every utterance is persisted server-side before it renders here;
// closing the tab mid-capture loses nothing (the sweep routes it).
import { use, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  Copy,
  Loader2,
  Mic,
  SlidersHorizontal,
  Sparkles,
  Square,
} from "lucide-react";
import { useVoiceRecorder } from "@/lib/use-voice-recorder";
import { useToast } from "@/components/toast";
import { PresetsModal, type Preset } from "@/components/voice/presets-modal";

interface Utterance {
  id: string;
  idx: number;
  role: "raw" | "prompt" | "answer";
  text: string;
}

export default function VoiceCapturePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<"live" | "ended" | "routed" | "loading">("loading");
  const [utterances, setUtterances] = useState<Utterance[]>([]);
  const [followUps, setFollowUps] = useState<string[]>([]);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [draft, setDraft] = useState<string>("");
  const [draftFormat, setDraftFormat] = useState<string>("");
  const [transforming, setTransforming] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    const [capRes, preRes] = await Promise.all([
      fetch(`/api/voicepal/${id}`),
      fetch(`/api/voicepal/presets`),
    ]);
    if (!capRes.ok) {
      toast("Capture not found", "error");
      router.push("/voice");
      return;
    }
    const data = await capRes.json();
    setTitle(data.capture.title);
    setStatus(data.capture.status);
    setUtterances(data.utterances);
    setDraft(data.capture.draft || "");
    setDraftFormat(data.capture.transformFormat || "");
    const pre = await preRes.json();
    setPresets(pre.presets || []);
  }, [id, router, toast]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [utterances.length, followUps.length]);

  const voice = useVoiceRecorder({
    endpoint: `/api/voicepal/${id}`,
    onResponse: async (data) => {
      setUtterances((prev) => [
        ...prev,
        { id: `u${prev.length}`, idx: prev.length, role: "raw", text: String(data.text) },
      ]);
      setFollowUps((data.followUps as string[]) || []);
      // A new utterance makes any existing draft stale — clear it so Samy
      // re-transforms the fuller stream rather than trusting an old draft.
      setDraft("");
      setDraftFormat("");
    },
    onTranscript: () => {},
    onError: (m) => toast(m, "error"),
  });

  const transform = async (preset: Preset) => {
    setTransforming(preset.id);
    try {
      const res = await fetch(`/api/voicepal/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "transform", presetId: preset.id }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
      setDraft(data.draft);
      setDraftFormat(data.format);
    } catch (e) {
      toast(e instanceof Error ? e.message : "transform failed", "error");
    } finally {
      setTransforming(null);
    }
  };

  const copyDraft = async () => {
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast("Couldn't copy", "error");
    }
  };

  const finish = async () => {
    setFinishing(true);
    try {
      const res = await fetch(`/api/voicepal/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "end" }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
      toast("Filed to the vault — Hermes will enrich it", "success");
      router.push("/voice");
    } catch (e) {
      toast(e instanceof Error ? e.message : "couldn't finish", "error");
      setFinishing(false);
    }
  };

  const busy = voice.state === "transcribing";
  const hasContent = utterances.length > 0;
  const live = status === "live";

  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col px-4 pb-6">
      <div className="flex items-center gap-3 py-4">
        <button
          onClick={() => router.push("/voice")}
          aria-label="Back to voice"
          className="rounded-lg p-2 transition-transform duration-150 active:scale-[0.92]"
          style={{ color: "var(--text-secondary)" }}
        >
          <ArrowLeft size={18} />
        </button>
        <Mic size={18} style={{ color: "var(--accent)" }} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            {title || "…"}
          </h1>
          <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
            Capture · {status}
          </p>
        </div>
        {live && (
          <button
            onClick={finish}
            disabled={finishing}
            className="rounded-lg px-3 py-1.5 text-xs font-medium transition-transform duration-150 active:scale-[0.97]"
            style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}
          >
            {finishing ? "Filing…" : "Finish"}
          </button>
        )}
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto py-2">
        {utterances.map((u) => (
          <div
            key={u.id}
            className="enter ml-auto max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed"
            style={{ background: "var(--accent-bg)", color: "var(--text-primary)" }}
          >
            {u.text}
          </div>
        ))}

        {busy && (
          <div
            className="flex w-fit items-center gap-2 rounded-2xl px-4 py-3 text-xs"
            style={{ background: "var(--bg-secondary)", color: "var(--text-tertiary)" }}
          >
            <Loader2 size={13} className="animate-spin" /> listening back…
          </div>
        )}

        {/* Shadow Reader follow-ups — the app talking back to keep him going */}
        {!busy && followUps.length > 0 && (
          <div className="enter max-w-[85%] space-y-1.5 rounded-2xl px-4 py-3" style={{ background: "var(--bg-secondary)" }}>
            <p className="flex items-center gap-1.5 text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
              <Sparkles size={12} style={{ color: "var(--accent)" }} /> Go deeper
            </p>
            {followUps.map((q, i) => (
              <p key={i} className="text-sm leading-snug" style={{ color: "var(--text-primary)" }}>
                {q}
              </p>
            ))}
          </div>
        )}

        {/* Draft output */}
        {draft && (
          <div
            className="enter rounded-2xl px-4 py-3"
            style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}
          >
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>
                {draftFormat}
              </p>
              <button
                onClick={copyDraft}
                aria-label="Copy draft"
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs transition-transform duration-150 active:scale-[0.95]"
                style={{ color: "var(--text-secondary)" }}
              >
                {copied ? <Check size={13} style={{ color: "var(--accent)" }} /> : <Copy size={13} />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <div className="whitespace-pre-wrap text-sm leading-relaxed" style={{ color: "var(--text-primary)" }}>
              {draft}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Transform bar — appears once there's something to transform */}
      {hasContent && (
        <div className="enter flex flex-wrap items-center gap-2 py-3">
          <span className="mr-1 text-xs font-medium" style={{ color: "var(--text-tertiary)" }}>
            Transform:
          </span>
          {presets.map((p) => (
            <button
              key={p.id}
              onClick={() => transform(p)}
              disabled={transforming !== null}
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-transform duration-150 active:scale-[0.95]"
              style={{
                background: draftFormat === p.name ? "var(--accent)" : "var(--bg-tertiary)",
                color: draftFormat === p.name ? "white" : "var(--text-secondary)",
                opacity: transforming && transforming !== p.id ? 0.5 : 1,
              }}
            >
              {transforming === p.id && <Loader2 size={12} className="animate-spin" />}
              {p.name}
            </button>
          ))}
          <button
            onClick={() => setPresetsOpen(true)}
            aria-label="Edit presets"
            className="flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs transition-transform duration-150 active:scale-[0.95]"
            style={{ color: "var(--text-tertiary)" }}
          >
            <SlidersHorizontal size={12} /> Edit
          </button>
        </div>
      )}

      {live ? (
        <>
          <div className="flex justify-center pb-2 pt-1">
            <button
              onClick={voice.state === "recording" ? voice.stop : voice.start}
              disabled={busy}
              aria-label={voice.state === "recording" ? "Stop recording" : "Start talking"}
              className="flex h-20 w-20 items-center justify-center rounded-full transition-transform active:scale-[0.94]"
              style={{
                background: voice.state === "recording" ? "var(--danger, #dc2626)" : "var(--accent)",
                color: "white",
                transitionDuration: "var(--duration-fast)",
                transitionTimingFunction: "var(--ease-out-custom)",
                opacity: busy ? 0.5 : 1,
              }}
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
          <p className="pb-1 text-center text-xs" style={{ color: "var(--text-tertiary)" }}>
            {voice.state === "recording"
              ? "tap to finish your thought"
              : hasContent
                ? "keep talking, or transform above"
                : "tap and just talk"}
          </p>
        </>
      ) : (
        <p className="py-4 text-center text-xs" style={{ color: "var(--text-tertiary)" }}>
          This capture is {status === "routed" ? "filed to the vault" : "closed"}.
        </p>
      )}

      <PresetsModal
        open={presetsOpen}
        onClose={() => setPresetsOpen(false)}
        onChanged={(p) => setPresets(p)}
      />
    </div>
  );
}

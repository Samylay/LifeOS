"use client";

// Tinder-style decision stack shared by the /decide decks (saved-content
// triage + NEEDS-SAMY approvals). Gesture-driven: the top card tracks the
// pointer 1:1 while dragging (no transition — direct manipulation), then
// either flies out (past the threshold) or springs back. Cards beneath
// promote via a CSS transform transition. Buttons reuse the same exit paths.
import { useRef, useState, type ReactNode } from "react";
import { Loader2, Mic, Square } from "lucide-react";
import { toast } from "sonner";
import type { LucideIcon } from "lucide-react";

export interface DeckAction {
  id: string;
  label: string;
  icon: LucideIcon;
  direction: "left" | "right" | "none";
  tone: "danger" | "success" | "accent" | "neutral";
}

interface CardStackProps<T extends { id: string }> {
  items: T[];
  renderCard: (item: T) => ReactNode;
  actions: DeckAction[];
  swipeLeftId: string;
  swipeRightId: string;
  /** Server call for one verdict; resolves to a short label for the toast. */
  perform: (item: T, actionId: string) => Promise<string>;
  /** Remove the item from the parent's list (optimistic, fired at exit start). */
  onResolved: (item: T) => void;
  /** Voice: interpret + apply a transcript server-side; resolves to the reply. */
  interpret?: (item: T, transcript: string) => Promise<string>;
  emptyLabel: string;
}

const TONE: Record<DeckAction["tone"], { bg: string; fg: string }> = {
  danger: { bg: "rgba(239,68,68,0.12)", fg: "#EF4444" },
  success: { bg: "rgba(34,197,94,0.12)", fg: "#22C55E" },
  accent: { bg: "var(--accent-bg)", fg: "var(--accent)" },
  neutral: { bg: "var(--bg-tertiary)", fg: "var(--text-secondary)" },
};

const SWIPE_PX = 90;
const SWIPE_VELOCITY = 0.6; // px/ms

type VoiceState = "idle" | "recording" | "thinking";

export function CardStack<T extends { id: string }>({
  items, renderCard, actions, swipeLeftId, swipeRightId,
  perform, onResolved, interpret, emptyLabel,
}: CardStackProps<T>) {
  const [drag, setDrag] = useState<{ dx: number; dy: number } | null>(null);
  const [exiting, setExiting] = useState<{ item: T; dir: "left" | "right" | "none" } | null>(null);
  const [voice, setVoice] = useState<VoiceState>("idle");
  const dragStart = useRef<{ x: number; y: number; t: number } | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const top = items[0];
  const busy = exiting !== null || voice !== "idle";

  const decide = (item: T, actionId: string, dir: "left" | "right" | "none") => {
    setDrag(null);
    setExiting({ item, dir });
    onResolved(item); // optimistic — the next card promotes immediately
    window.setTimeout(() => setExiting(null), 280);
    perform(item, actionId)
      .then((label) => toast.success(label))
      .catch((e) => toast.error(e instanceof Error ? e.message : "failed — refresh to retry"));
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (busy || !top) return;
    // Let links/buttons inside the card work untouched.
    if ((e.target as HTMLElement).closest("a,button")) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragStart.current = { x: e.clientX, y: e.clientY, t: performance.now() };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragStart.current) return;
    setDrag({ dx: e.clientX - dragStart.current.x, dy: e.clientY - dragStart.current.y });
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const start = dragStart.current;
    dragStart.current = null;
    if (!start || !top) return;
    const dx = e.clientX - start.x;
    const velocity = Math.abs(dx) / Math.max(1, performance.now() - start.t);
    if (Math.abs(dx) > SWIPE_PX || (Math.abs(dx) > 24 && velocity > SWIPE_VELOCITY)) {
      const dir = dx > 0 ? "right" : "left";
      decide(top, dir === "right" ? swipeRightId : swipeLeftId, dir);
    } else {
      setDrag(null); // transition springs it back
    }
  };

  // --- voice verdict (MediaRecorder → /api/voice happens in `interpret`'s
  // caller-supplied pipeline; here we only gather audio and hand off) ---
  const startVoice = async () => {
    if (!top || !interpret) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = (ev) => ev.data.size > 0 && chunksRef.current.push(ev.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setVoice("thinking");
        try {
          const form = new FormData();
          form.append("audio", new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" }), "verdict.webm");
          const res = await fetch("/api/voice", { method: "POST", body: form });
          const data = await res.json();
          if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
          const reply = await interpret(top, data.transcript);
          toast.success(reply);
          setVoice("idle");
          setExiting({ item: top, dir: "none" });
          onResolved(top);
          window.setTimeout(() => setExiting(null), 280);
        } catch (err) {
          setVoice("idle");
          toast.error(err instanceof Error ? err.message : "voice verdict failed");
        }
      };
      recorderRef.current = rec;
      rec.start();
      setVoice("recording");
    } catch {
      toast.error("Microphone unavailable — check browser permissions.");
    }
  };
  const stopVoice = () => recorderRef.current?.stop();

  const dragging = drag !== null && dragStart.current !== null;
  const dx = drag?.dx ?? 0;
  const swipeTarget = dx > 0
    ? actions.find((a) => a.id === swipeRightId)
    : actions.find((a) => a.id === swipeLeftId);

  const cardStyle = (index: number): React.CSSProperties => {
    if (index === 0) {
      const t = dragging || drag
        ? `translate(${dx}px, ${(drag?.dy ?? 0) * 0.2}px) rotate(${dx * 0.04}deg)`
        : "translate(0px, 0px) rotate(0deg)";
      return {
        transform: t,
        transition: dragging ? "none" : "transform var(--dur-base) var(--ease-out-custom)",
        touchAction: "pan-y",
      };
    }
    const depth = Math.min(index, 2);
    return {
      transform: `translateY(${depth * 12}px) scale(${1 - depth * 0.04})`,
      opacity: index > 2 ? 0 : 1,
      transition: "transform var(--dur-base) var(--ease-out-custom), opacity var(--dur-base) var(--ease-out-custom)",
      pointerEvents: "none",
    };
  };

  const exitStyle = (dir: "left" | "right" | "none"): React.CSSProperties =>
    dir === "none"
      ? {
          transform: "scale(0.92)",
          opacity: 0,
          filter: "blur(2px)",
          transition: "transform 260ms var(--ease-out-custom), opacity 260ms var(--ease-out-custom), filter 260ms var(--ease-out-custom)",
        }
      : {
          transform: `translateX(${dir === "right" ? 120 : -120}%) rotate(${dir === "right" ? 14 : -14}deg)`,
          opacity: 0,
          transition: "transform 280ms var(--ease-out-custom), opacity 280ms var(--ease-out-custom)",
        };

  if (items.length === 0 && !exiting) {
    return (
      <div className="rounded-xl p-10 text-center text-sm"
        style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)", color: "var(--text-tertiary)" }}>
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative" style={{ minHeight: 420 }}>
        {/* Under-cards first so the top card paints above them. */}
        {items.slice(0, 3).map((item, i) => (
          <div
            key={item.id}
            className="absolute inset-x-0 top-0 rounded-xl select-none"
            style={{
              background: "var(--bg-secondary)",
              border: "1px solid var(--border-primary)",
              zIndex: 10 - i,
              ...cardStyle(i),
            }}
            {...(i === 0
              ? { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp }
              : {})}
          >
            {i === 0 && swipeTarget && Math.abs(dx) > 12 && (
              <div
                className="absolute top-4 rounded-md px-2 py-1 text-xs font-bold uppercase tracking-wider"
                style={{
                  [dx > 0 ? "left" : "right"]: 16,
                  transform: `rotate(${dx > 0 ? -8 : 8}deg)`,
                  background: TONE[swipeTarget.tone].bg,
                  color: TONE[swipeTarget.tone].fg,
                  border: `1.5px solid ${TONE[swipeTarget.tone].fg}`,
                  opacity: Math.min(Math.abs(dx) / 110, 1),
                  zIndex: 20,
                }}
              >
                {swipeTarget.label}
              </div>
            )}
            {renderCard(item)}
          </div>
        ))}
        {exiting && (
          <div
            key={`exit-${exiting.item.id}`}
            className="absolute inset-x-0 top-0 rounded-xl"
            style={{
              background: "var(--bg-secondary)",
              border: "1px solid var(--border-primary)",
              zIndex: 30,
              ...exitStyle(exiting.dir),
            }}
          >
            {renderCard(exiting.item)}
          </div>
        )}
      </div>

      <div className="flex items-center justify-center gap-2 flex-wrap">
        {actions.map((a) => {
          const Icon = a.icon;
          return (
            <button
              key={a.id}
              disabled={!top || busy}
              onClick={() => top && decide(top, a.id, a.direction)}
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-transform duration-150 active:scale-[0.97] disabled:opacity-40"
              style={{ background: TONE[a.tone].bg, color: TONE[a.tone].fg }}
            >
              <Icon size={15} /> {a.label}
            </button>
          );
        })}
        {interpret && (
          voice === "recording" ? (
            <button onClick={stopVoice}
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-transform duration-150 active:scale-[0.97]"
              style={{ background: "#EF4444", color: "white" }}>
              <Square size={15} />
              <span className="h-2 w-2 rounded-full animate-pulse" style={{ background: "white" }} />
            </button>
          ) : (
            <button onClick={startVoice} disabled={!top || busy}
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-transform duration-150 active:scale-[0.97] disabled:opacity-40"
              style={{ background: "var(--accent-bg)", color: "var(--accent)" }}>
              {voice === "thinking" ? <Loader2 size={15} className="animate-spin" /> : <Mic size={15} />}
              Voice
            </button>
          )
        )}
      </div>
      <p className="text-center text-xs" style={{ color: "var(--text-tertiary)" }}>
        {items.length} to decide · swipe or use the buttons — voice for anything nuanced
      </p>
    </div>
  );
}

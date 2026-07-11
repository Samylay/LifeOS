"use client";

// Tinder-style decision stack shared by the /decide decks (saved-content
// triage + NEEDS-SAMY approvals). Gesture-driven: the top card tracks the
// pointer 1:1 while dragging (no transition — direct manipulation), then
// either flies out (past the commit thresholds) or springs back. Cards
// beneath promote via a CSS transform transition. Buttons reuse the same
// exit paths, and every commit gets an Undo toast.
//
// Gesture thresholds follow the established swipe libraries (2026-07-11 fix —
// v1 committed on a 24px nudge and ate cards before Samy could read them):
// - 12px slop before the card tracks at all, with axis intent locked at slop
//   crossing so vertical scrolling never drags the card (Vaul's
//   swipeStartThreshold=10px touch + shouldDrag; use-gesture `axis: 'lock'`).
// - Commit on release only when displacement ≥ 45% of card width (Vaul's
//   CLOSE_THRESHOLD is 25% of dimension; we run conservative) OR a real
//   flick: velocity ≥ 0.5 px/ms (use-gesture swipe.velocity default 0.5,
//   react-tinder-card swipeThreshold default 0.5) AND ≥ 60px displacement
//   (use-gesture swipe.distance 50px) AND the flick direction matches the
//   displacement sign. Velocity is measured over the last ≤120ms of motion,
//   not the whole gesture. Everything else springs back.
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
  /** Server call reverting a verdict (the Undo toast); throws on failure. */
  undo?: (item: T) => Promise<void>;
  /** Re-insert an undone item at the front of the parent's list. */
  onRestore?: (item: T) => void;
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

const SLOP_PX = 12; // movement before the card tracks at all (Vaul: 10px touch)
const COMMIT_FRACTION = 0.45; // of card width (Vaul: 0.25 of dimension; conservative)
const FLICK_VELOCITY = 0.5; // px/ms (use-gesture + react-tinder-card default)
const FLICK_MIN_PX = 60; // a flick also needs real displacement (use-gesture: 50)
const VELOCITY_WINDOW_MS = 120; // measure velocity over recent motion only
const UNDO_MS = 6000;

type VoiceState = "idle" | "recording" | "thinking";

interface Gesture {
  startX: number;
  startY: number;
  axis: "x" | "y" | null; // locked at slop crossing; 'y' = scroll, card never moves
  history: { x: number; t: number }[];
}

export function CardStack<T extends { id: string }>({
  items, renderCard, actions, swipeLeftId, swipeRightId,
  perform, onResolved, undo, onRestore, interpret, emptyLabel,
}: CardStackProps<T>) {
  const [drag, setDrag] = useState<{ dx: number; dy: number } | null>(null);
  const [exiting, setExiting] = useState<{ item: T; dir: "left" | "right" | "none" } | null>(null);
  const [voice, setVoice] = useState<VoiceState>("idle");
  const gestureRef = useRef<Gesture | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const top = items[0];
  const busy = exiting !== null || voice !== "idle";

  const undoToast = (item: T, label: string) =>
    toast.success(label, {
      duration: UNDO_MS,
      action: undo && onRestore
        ? {
            label: "Undo",
            onClick: () =>
              undo(item)
                .then(() => {
                  onRestore(item);
                  toast.success("returned to the deck");
                })
                .catch((e) => toast.error(e instanceof Error ? e.message : "undo failed")),
          }
        : undefined,
    });

  const decide = (item: T, actionId: string, dir: "left" | "right" | "none") => {
    setDrag(null);
    setExiting({ item, dir });
    onResolved(item); // optimistic — the next card promotes immediately
    window.setTimeout(() => setExiting(null), 280);
    perform(item, actionId)
      .then((label) => undoToast(item, label))
      .catch((e) => toast.error(e instanceof Error ? e.message : "failed — refresh to retry"));
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (busy || !top) return;
    // Let links/buttons inside the card work untouched.
    if ((e.target as HTMLElement).closest("a,button")) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    gestureRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      axis: null,
      history: [{ x: e.clientX, t: performance.now() }],
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const g = gestureRef.current;
    if (!g) return;
    const dx = e.clientX - g.startX;
    const dy = e.clientY - g.startY;

    if (g.axis === null) {
      // Inside the slop radius: the card does not move (taps/jitter never drag).
      if (Math.max(Math.abs(dx), Math.abs(dy)) < SLOP_PX) return;
      // Lock axis at intent: mostly-vertical means scroll — never grab the card.
      g.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      if (g.axis === "y") return;
    }
    if (g.axis !== "x") return;

    const now = performance.now();
    g.history.push({ x: e.clientX, t: now });
    while (g.history.length > 2 && now - g.history[0].t > VELOCITY_WINDOW_MS) g.history.shift();
    setDrag({ dx, dy });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const g = gestureRef.current;
    gestureRef.current = null;
    if (!g || g.axis !== "x" || !top) {
      setDrag(null);
      return;
    }
    const dx = e.clientX - g.startX;
    const width = (e.currentTarget as HTMLElement).offsetWidth || 360;

    // Signed velocity in px/ms over the last ≤120ms of motion.
    const oldest = g.history[0];
    const dt = Math.max(1, performance.now() - oldest.t);
    const velocity = (e.clientX - oldest.x) / dt;

    const bigDrag = Math.abs(dx) >= width * COMMIT_FRACTION;
    const flick =
      Math.abs(velocity) >= FLICK_VELOCITY &&
      Math.abs(dx) >= FLICK_MIN_PX &&
      Math.sign(velocity) === Math.sign(dx);

    if (bigDrag || flick) {
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
          undoToast(top, reply);
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

  const dragging = gestureRef.current?.axis === "x";
  const dx = drag?.dx ?? 0;
  const swipeTarget = dx > 0
    ? actions.find((a) => a.id === swipeRightId)
    : actions.find((a) => a.id === swipeLeftId);

  const cardStyle = (index: number): React.CSSProperties => {
    if (index === 0) {
      const t = drag
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
            {i === 0 && swipeTarget && Math.abs(dx) > 24 && (
              <div
                className="absolute top-4 rounded-md px-2 py-1 text-xs font-bold uppercase tracking-wider"
                style={{
                  [dx > 0 ? "left" : "right"]: 16,
                  transform: `rotate(${dx > 0 ? -8 : 8}deg)`,
                  background: TONE[swipeTarget.tone].bg,
                  color: TONE[swipeTarget.tone].fg,
                  border: `1.5px solid ${TONE[swipeTarget.tone].fg}`,
                  opacity: Math.min(Math.abs(dx) / 160, 1),
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

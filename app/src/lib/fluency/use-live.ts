"use client";
import { useEffect, useRef, useState } from "react";
import type { Conversation } from "@elevenlabs/client";
import type { Session } from "./model";
import { request } from "./client";

export function useLive(s: Session, onSaved: (s: Session) => void, onError: (text: string) => void) {
  const [state, setState] = useState("idle"), [muted, setMuted] = useState(false), [caption, setCaption] = useState("");
  const connection = useRef<Conversation | null>(null), generation = useRef(0);
  const callbacks = useRef({ onSaved, onError });
  callbacks.current = { onSaved, onError };
  const queue = useRef<Promise<void>>(Promise.resolve());
  const pending = useRef<Record<string, unknown>[]>([]);
  const key = `fluency-outbox:${s.id}`;
  const [unsaved, setUnsaved] = useState(0);
  useEffect(() => {
    const guard = generation;
    try { pending.current = JSON.parse(localStorage.getItem(key) || "[]"); } catch { pending.current = []; }
    setUnsaved(pending.current.length);
    return () => { guard.current++; void connection.current?.endSession(); connection.current = null; };
  }, [key]);
  const persist = () => {
    setUnsaved(pending.current.length);
    try { localStorage.setItem(key, JSON.stringify(pending.current)); }
    catch { callbacks.current.onError("Browser recovery storage is unavailable. Keep this page open until speech is saved."); }
  };
  const flush = () => {
    queue.current = queue.current.catch(() => {}).then(async () => {
      while (pending.current.length) {
        const next = pending.current[0];
        const result = await request<{ session: Session }>(next);
        pending.current.shift(); persist(); callbacks.current.onSaved(result.session);
      }
    });
    return queue.current;
  };
  const stop = async () => {
    const c = connection.current; connection.current = null;
    if (!c) generation.current++;
    try { await c?.endSession(); } finally { if (c) generation.current++; setState("idle"); setMuted(false); }
    await flush();
  };
  const start = async () => {
    const gen = ++generation.current;
    setState("connecting");
    try {
      await flush();
      const data = await request<{ token: string; context: string }>({ action: "voice", id: s.id, phase: s.phase });
      if (gen !== generation.current) return;
      const { Conversation } = await import("@elevenlabs/client");
      const seen = new Set<string>(), call = crypto.randomUUID();
      const c = await Conversation.startSession({
        conversationToken: data.token, connectionType: "webrtc", dynamicVariables: { training_context: data.context },
        overrides: { agent: { language: s.material.language, firstMessage: s.material.language === "fr" ? "Prenez votre temps. Essayez la consigne à l’écran quand vous êtes prêt." : "Take your time. Try the prompt on screen when you are ready." } },
        onMessage: ({ role, message, event_id }) => {
          if (gen !== generation.current || !message.trim()) return;
          const event = event_id === undefined ? crypto.randomUUID() : `${role}:${event_id}`;
          if (seen.has(event)) return;
          seen.add(event); setCaption(message);
          pending.current.push({ action: "turn", id: s.id, phase: s.phase, turnId: `${call}:${event}`, text: message, role, source: "live" });
          try { persist(); } catch { callbacks.current.onError("Browser recovery storage is unavailable. Keep this page open until speech is saved."); }
          void flush().catch(() => callbacks.current.onError("Speech is waiting to save. Retry saving before reviewing or leaving."));
        },
        onModeChange: ({ mode }) => { if (gen === generation.current) setState(mode); },
        onDisconnect: () => { if (gen === generation.current) { connection.current = null; setState("idle"); } },
        onError: () => { if (gen === generation.current) callbacks.current.onError("Live voice disconnected. Your saved turns remain available. Reconnect to continue."); },
      });
      if (gen !== generation.current) { await c.endSession(); return; }
      connection.current = c; setState("listening"); setMuted(false);
    } catch (e) { if (gen === generation.current) { setState("idle"); callbacks.current.onError(e instanceof Error ? e.message : "Could not start live voice."); } }
  };
  const toggleMute = () => { const next = !muted; connection.current?.setMicMuted(next); connection.current?.setVolume({ volume: next ? 0 : 1 }); setMuted(next); };
  return { state, caption, muted, unsaved, start, stop, flush, toggleMute };
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function useAssistantVoice(sendMessage: (message: string) => Promise<string | null>, enabled = true) {
  const [liveVoice, setLiveVoice] = useState<"idle" | "connecting" | "listening" | "speaking" | "thinking" | "error">("idle");
  const [liveVoiceAvailable, setLiveVoiceAvailable] = useState(false);
  const [liveVoiceError, setLiveVoiceError] = useState("");
  const [liveCaption, setLiveCaption] = useState("");
  const liveConversation = useRef<import("@elevenlabs/client").Conversation | null>(null);
  const liveVoiceGeneration = useRef(0);
  const sendMessageRef = useRef(sendMessage);
  sendMessageRef.current = sendMessage;
  useEffect(() => {
    const abort = new AbortController();
    void fetch("/api/voice/assistant", { signal: abort.signal })
      .then((response) => response.json())
      .then((data) => setLiveVoiceAvailable(Boolean(data.available)))
      .catch(() => {});
    return () => abort.abort();
  }, []);

  const stopLiveVoice = useCallback(async () => {
    liveVoiceGeneration.current++;
    const active = liveConversation.current;
    liveConversation.current = null;
    setLiveVoice("idle");
    if (active) await active.endSession().catch(() => {});
  }, []);

  useEffect(() => {
    if (!enabled) void stopLiveVoice();
    return () => { void stopLiveVoice(); };
  }, [enabled, stopLiveVoice]);

  const toggleLiveVoice = async () => {
    if (liveConversation.current) {
      await stopLiveVoice();
      return;
    }
    const generation = ++liveVoiceGeneration.current;
    setLiveVoice("connecting");
    setLiveVoiceError("");
    setLiveCaption("");
    try {
      const response = await fetch("/api/voice/assistant", { method: "POST" });
      const data = await response.json();
      if (!response.ok || typeof data.token !== "string") throw new Error(data.error || "Could not connect live voice.");
      if (generation !== liveVoiceGeneration.current) return;
      const { Conversation } = await import("@elevenlabs/client");
      const conversation = await Conversation.startSession({
        conversationToken: data.token,
        connectionType: "webrtc",
        clientTools: {
          ask_lifeos: async (params: { message?: unknown }) => {
            if (generation !== liveVoiceGeneration.current) throw new Error("Voice conversation ended.");
            if (typeof params.message !== "string" || !params.message.trim()) throw new Error("No spoken message was received.");
            setLiveVoice("thinking");
            const reply = await sendMessageRef.current(params.message);
            if (!reply) throw new Error("LifeOS could not complete that response.");
            return reply;
          },
        },
        onModeChange: ({ mode }) => { if (generation === liveVoiceGeneration.current) setLiveVoice(mode === "speaking" ? "speaking" : mode === "listening" ? "listening" : mode === "thinking" ? "thinking" : "connecting"); },
        onMessage: ({ role, message }) => { if (generation === liveVoiceGeneration.current && role === "agent" && message.trim()) setLiveCaption(message); },
        onDisconnect: () => { if (generation === liveVoiceGeneration.current) { liveConversation.current = null; setLiveVoice("idle"); } },
        onError: (message) => { if (generation === liveVoiceGeneration.current) { setLiveVoiceError(message || "Live voice disconnected."); setLiveVoice("error"); } },
      });
      if (generation !== liveVoiceGeneration.current) { await conversation.endSession(); return; }
      liveConversation.current = conversation;
      setLiveVoice("listening");
    } catch (error) {
      if (generation !== liveVoiceGeneration.current) return;
      setLiveVoiceError(error instanceof Error ? error.message : "Could not start live voice.");
      setLiveVoice("error");
    }
  };

  return { liveVoice, liveVoiceAvailable, liveVoiceError, liveCaption, stopLiveVoice, toggleLiveVoice };
}

"use client";

import { useState, useRef, useEffect, useCallback, KeyboardEvent } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { useIsMobile } from "@/hooks/use-shell-mobile";
import {
  X,
  Send,
  Trash2,
  Bot,
  User,
  CheckCircle2,
  Loader2,
  ClipboardPaste,
  Mic,
  Square,
  Volume2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/lib/store";
import { useChat, type ActionResult } from "@/lib/use-chat";
import { RunNowChip } from "@/components/run-now-chip";
import { useVoiceRecorder } from "@/lib/use-voice-recorder";
import { useVisualViewport } from "@/lib/use-visual-viewport";

function ActionBadge({ result }: { result: ActionResult }) {
  const failed = result.failed || result.summary.startsWith("Failed");
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        failed
          ? "bg-destructive/10 text-destructive"
          : "bg-primary/10 text-primary"
      )}
    >
      <CheckCircle2 size={10} />
      {result.summary}
    </span>
  );
}

export function ChatPanel() {
  const { chatPanelOpen, setChatPanelOpen } = useAppStore();
  const isMobile = useIsMobile();
  const { messages, loading, statusText, sendMessage, clearMessages, stop, retryLast } =
    useChat();
  const [liveVoice, setLiveVoice] = useState<"idle" | "connecting" | "listening" | "speaking" | "thinking" | "error">("idle");
  const [liveVoiceAvailable, setLiveVoiceAvailable] = useState(false);
  const [liveVoiceError, setLiveVoiceError] = useState("");
  const [liveCaption, setLiveCaption] = useState("");
  const liveConversation = useRef<import("@elevenlabs/client").Conversation | null>(null);
  const liveVoiceGeneration = useRef(0);
  const sendMessageRef = useRef(sendMessage);
  sendMessageRef.current = sendMessage;
  // The soft keyboard shrinks the visual viewport only, so a 100vh panel would
  // hide its composer underneath the keyboard. Track the visible area instead.
  const viewport = useVisualViewport();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  // Scroll anchoring: auto-scroll only sticks while the user is at the bottom
  // (gap ≤ 60px). Scrolling up releases it; scrolling back down (or sending a
  // new message) re-engages it.
  const userScrolledRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
    if (!chatPanelOpen) void stopLiveVoice();
    return () => { void stopLiveVoice(); };
  }, [chatPanelOpen, stopLiveVoice]);

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
      setLiveVoiceError(error instanceof Error ? error.message : "Could not start live voice.");
      setLiveVoice("error");
    }
  };

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const gap = el.scrollHeight - el.scrollTop - el.clientHeight;
    userScrolledRef.current = gap > 60;
  };

  // A new request starting = the user just acted; re-engage the anchor.
  useEffect(() => {
    if (loading) userScrolledRef.current = false;
  }, [loading]);

  // Scroll the messages container directly, never scrollIntoView: the panel is
  // parked off-canvas right (translateX(100%)) when closed, and scrollIntoView
  // walks every scrollable ancestor — on mobile it panned the whole layout
  // viewport horizontally toward the hidden panel, shifting the app left and
  // dragging fixed elements (nav, toasts) off-screen.
  useEffect(() => {
    if (userScrolledRef.current) return;
    const el = scrollRef.current;
    if (!el) return;
    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ top: el.scrollHeight, behavior: reduceMotion ? "auto" : "smooth" });
  }, [messages, loading, statusText]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height =
        Math.min(textareaRef.current.scrollHeight, 160) + "px";
    }
  }, [input]);


  const handleSend = () => {
    if (!input.trim() || loading) return;
    sendMessage(input);
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setInput((prev) => prev + text);
        textareaRef.current?.focus();
      }
    } catch {
      textareaRef.current?.focus();
    }
  };

  // Voice dictation: transcript lands in the input for review before sending
  // (chat is open-ended — unlike /decide's one-card verdicts, auto-send here
  // would fire misheard commands at the homelab tools).
  const { state: voice, start: startVoice, stop: stopVoice } = useVoiceRecorder({
    onTranscript: (transcript) => {
      const t = transcript.trim();
      if (!t) {
        toast.error("Didn't catch that — try again.");
        return;
      }
      setInput((prev) => (prev ? `${prev.replace(/\s+$/, "")} ${t}` : t));
      textareaRef.current?.focus();
    },
    onError: (msg) => toast.error(msg),
  });

  return (
    <Dialog.Root open={chatPanelOpen} onOpenChange={setChatPanelOpen} modal={isMobile} disablePointerDismissal={!isMobile}>
      <Dialog.Portal>
        {isMobile && <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/55 transition-opacity duration-[var(--dur-base)] ease-[var(--ease-out-custom)] data-starting-style:opacity-0 data-ending-style:opacity-0" />}
        <Dialog.Popup
          initialFocus={textareaRef}
          aria-label="Assistant"
          className="fixed right-0 z-50 flex flex-col border-l border-border bg-card transition-[transform,opacity] duration-[var(--dur-slow)] ease-[var(--ease-drawer)] data-starting-style:translate-x-full data-ending-style:translate-x-full"
        style={{
          width: "min(400px, 100vw)",
          // Follow the visible area so the composer stays above the keyboard.
          // `100dvh` is the pre-measurement fallback (also correct on desktop).
          top: viewport.ready ? viewport.offsetTop : 0,
          height: viewport.ready ? viewport.height : "100dvh",
        }}
      >
        {/* Header */}
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
          <div className="flex items-center gap-2">
            <Bot size={18} className="text-primary" />
            <Dialog.Title className="text-sm font-semibold text-foreground">Assistant</Dialog.Title>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant={liveConversation.current || liveVoice === "connecting" || liveVoice === "thinking" || liveVoice === "speaking" || liveVoice === "listening" ? "default" : "ghost"}
              size="icon-sm"
              onClick={() => void toggleLiveVoice()}
              disabled={!liveVoiceAvailable || (liveVoice === "idle" && (loading || voice !== "idle")) || liveVoice === "connecting"}
              aria-label={liveConversation.current ? "End voice conversation" : "Start voice conversation"}
              title={liveConversation.current ? "End voice conversation" : liveVoiceAvailable ? "Talk to LifeOS" : "Live voice is not configured"}
              className="active:scale-[0.97]"
            >
              {liveVoice === "connecting" ? <Loader2 size={15} className="animate-spin" /> : liveVoice === "listening" || liveVoice === "thinking" || liveVoice === "speaking" ? <Square size={13} /> : <Volume2 size={16} />}
            </Button>
            {messages.length > 0 && (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={clearMessages}
                className="text-muted-foreground"
                title="Clear conversation"
                aria-label="Clear conversation"
              >
                <Trash2 size={16} />
              </Button>
            )}
            <Dialog.Close render={<Button variant="ghost" size="icon-sm" aria-label="Close assistant" className="text-muted-foreground" />}>
              <X size={18} />
            </Dialog.Close>
          </div>
        </div>

        {(liveVoice !== "idle" || liveVoiceError) && (
          <div className="shrink-0 border-b border-border bg-muted/40 px-4 py-2" aria-live="polite">
            <p className="text-xs font-medium text-primary">{liveVoice === "connecting" ? "Connecting microphone…" : liveVoice === "listening" ? "Listening. Speak naturally." : liveVoice === "thinking" ? "LifeOS is thinking…" : liveVoice === "speaking" ? "LifeOS is speaking" : liveVoice === "error" ? "Voice disconnected" : "Voice conversation ended"}</p>
            {liveVoiceError && <p role="alert" className="mt-1 text-xs text-destructive">{liveVoiceError}</p>}
            {liveCaption && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{liveCaption}</p>}
          </div>
        )}

        {/* Messages */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          role="log"
          aria-live="polite"
          aria-atomic="false"
          aria-label="Assistant conversation"
          className="flex-1 overflow-y-auto px-3 py-3"
        >
          {messages.length === 0 && !loading ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                <Bot size={24} className="text-primary" />
              </div>
              <p className="text-center text-sm font-medium text-foreground">
                Ask a question or paste a thought
              </p>
              <p className="text-center text-xs text-muted-foreground">
                Review the result here.
              </p>
              <div className="mt-2 flex w-full flex-col gap-1.5">
                {[
                  "Paste my Notion page",
                  "Review queued instructions",
                  "How's the homelab doing?",
                ].map((ex, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setInput(ex);
                      textareaRef.current?.focus();
                    }}
                    className="rounded-lg bg-muted px-3 py-2 text-left text-xs text-muted-foreground transition-transform duration-150 hover:bg-muted/70"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={cn("flex gap-2", msg.role === "user" && "flex-row-reverse")}
                >
                  <div
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
                      msg.role === "user" ? "bg-primary" : "bg-primary/10"
                    )}
                  >
                    {msg.role === "user" ? (
                      <User size={14} className="text-primary-foreground" />
                    ) : (
                      <Bot size={14} className="text-primary" />
                    )}
                  </div>
                  <div
                    className={cn(
                      "flex max-w-[85%] flex-col gap-1.5",
                      msg.role === "user" && "items-end"
                    )}
                  >
                    <div
                      className={cn(
                        "whitespace-pre-wrap rounded-xl px-3 py-2 text-xs leading-relaxed",
                        msg.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-foreground"
                      )}
                    >
                      {msg.content}
                    </div>
                    {msg.interrupted && (
                      <div className="flex items-center gap-2 px-1">
                        <span className="text-[11px] text-muted-foreground">
                          Interrupted
                        </span>
                        {msg.id === messages[messages.length - 1]?.id && !loading && (
                          <button
                            onClick={retryLast}
                            className="text-[11px] font-medium text-primary transition-transform duration-150 hover:underline active:scale-[0.97]"
                          >
                            Retry
                          </button>
                        )}
                      </div>
                    )}
                    {msg.actions && msg.actions.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1">
                        {msg.actions.map((a, i) => (
                          <span key={i} className="inline-flex items-center gap-1">
                            <ActionBadge result={a} />
                            {a.confirm && <RunNowChip promptId={a.confirm.promptId} title={a.confirm.title} />}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex gap-2" aria-busy="true">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <Bot size={14} className="text-primary" />
                  </div>
                  <div className="flex items-center gap-2 rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground">
                    <Loader2
                      size={12}
                      aria-hidden="true"
                      className="animate-spin text-primary"
                    />
                    <span>{statusText ?? "Thinking..."}</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Input */}
        <div className="flex shrink-0 items-end gap-2 border-t border-border px-3 py-3">
          <Button
            variant="secondary"
            size="icon-sm"
            onClick={handlePaste}
            aria-label="Paste from clipboard"
            title="Paste from clipboard"
            className="shrink-0 text-muted-foreground"
          >
            <ClipboardPaste size={14} />
          </Button>
          {voice === "recording" ? (
            <Button
              size="icon-sm"
              onClick={stopVoice}
              aria-label="Stop recording"
              title="Stop recording"
              className="shrink-0 bg-destructive text-white hover:bg-destructive/90 active:scale-[0.97]"
            >
              <Square size={12} className="animate-pulse" />
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="icon-sm"
              onClick={startVoice}
              disabled={voice !== "idle" || loading}
              aria-label="Dictate a message"
              title="Dictate a message"
              className="shrink-0 text-muted-foreground active:scale-[0.97]"
            >
              {voice === "transcribing" ? (
                <Loader2 size={14} className="animate-spin text-primary" />
              ) : (
                <Mic size={14} />
              )}
            </Button>
          )}
          <p role="status" className="sr-only">
            {voice === "recording" ? "recording" : voice === "transcribing" ? "transcribing" : ""}
          </p>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Paste or type..."
            rows={1}
            className="flex-1 resize-none rounded-lg bg-muted px-3 py-2 text-xs leading-normal text-foreground outline-none"
            style={{ maxHeight: 160 }}
          />
          {loading ? (
            <Button
              size="icon-sm"
              onClick={stop}
              aria-label="Stop response"
              title="Stop response"
              className="shrink-0 active:scale-[0.97]"
            >
              <Square size={12} />
            </Button>
          ) : (
            <Button
              size="icon-sm"
              onClick={handleSend}
              disabled={!input.trim()}
              aria-label="Send message"
              className={cn(
                "shrink-0",
                !input.trim() && "bg-muted text-muted-foreground hover:bg-muted"
              )}
            >
              <Send size={14} />
            </Button>
          )}
        </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

"use client";

import { useState, useRef, useEffect, KeyboardEvent } from "react";
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
  const { messages, loading, statusText, sendMessage, clearMessages } = useChat();
  // The soft keyboard shrinks the visual viewport only, so a 100vh panel would
  // hide its composer underneath the keyboard. Track the visible area instead.
  const viewport = useVisualViewport();
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height =
        Math.min(textareaRef.current.scrollHeight, 160) + "px";
    }
  }, [input]);

  // Focus textarea when panel opens
  useEffect(() => {
    if (chatPanelOpen) {
      setTimeout(() => textareaRef.current?.focus(), 300);
    }
  }, [chatPanelOpen]);

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
    <>
      {/* Backdrop */}
      {chatPanelOpen && (
        <div
          className="fixed inset-0 z-[45] bg-black/40 lg:hidden"
          onClick={() => setChatPanelOpen(false)}
        />
      )}

      {/* Panel */}
      <aside
        className="fixed right-0 z-[46] flex flex-col border-l border-border bg-card transition-transform"
        style={{
          width: "min(400px, 100vw)",
          // Follow the visible area so the composer stays above the keyboard.
          // `100dvh` is the pre-measurement fallback (also correct on desktop).
          top: viewport.ready ? viewport.offsetTop : 0,
          height: viewport.ready ? viewport.height : "100dvh",
          transitionDuration: "var(--dur-slow)",
          transitionTimingFunction: "var(--ease-drawer)",
          transform: chatPanelOpen ? "translateX(0)" : "translateX(100%)",
        }}
      >
        {/* Header */}
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
          <div className="flex items-center gap-2">
            <Bot size={18} className="text-primary" />
            <span className="text-sm font-semibold text-foreground">Assistant</span>
          </div>
          <div className="flex items-center gap-1">
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
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setChatPanelOpen(false)}
              className="text-muted-foreground"
            >
              <X size={18} />
            </Button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-3 py-3">
          {messages.length === 0 && !loading ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                <Bot size={24} className="text-primary" />
              </div>
              <p className="text-center text-sm font-medium text-foreground">
                Paste your notes or ask me anything
              </p>
              <p className="text-center text-xs text-muted-foreground">
                I&apos;ll extract tasks, habits, and more from your text.
              </p>
              <div className="mt-2 flex w-full flex-col gap-1.5">
                {[
                  "Paste my Notion page",
                  "Launch the stuff queued in the approve page",
                  "How's the homelab doing?",
                ].map((ex, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setInput(ex);
                      textareaRef.current?.focus();
                    }}
                    className="rounded-lg bg-muted px-3 py-2 text-left text-xs text-muted-foreground transition-colors duration-150 hover:bg-muted/70"
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
                    {msg.actions && msg.actions.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1">
                        {msg.actions.map((a, i) => (
                          <span key={i} className="inline-flex items-center gap-1">
                            <ActionBadge result={a} />
                            {a.confirm && (
                              <RunNowChip promptId={a.confirm.promptId} title={a.confirm.title} />
                            )}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex gap-2">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <Bot size={14} className="text-primary" />
                  </div>
                  <div className="flex items-center gap-2 rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground">
                    <Loader2 size={12} className="animate-spin text-primary" />
                    <span aria-live="polite">{statusText ?? "Thinking..."}</span>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
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
          <Button
            size="icon-sm"
            onClick={handleSend}
            disabled={!input.trim() || loading}
            aria-label="Send message"
            className={cn(
              "shrink-0",
              !(input.trim() && !loading) && "bg-muted text-muted-foreground hover:bg-muted"
            )}
          >
            {loading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Send size={14} />
            )}
          </Button>
        </div>
      </aside>
    </>
  );
}

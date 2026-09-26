"use client";

import { KeyboardEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUp, BookOpen, Check, LoaderCircle, Plus, RotateCcw, Sparkles, Square, Mic, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { useAssistantVoice } from "@/lib/use-assistant-voice";
import { useVoiceRecorder } from "@/lib/use-voice-recorder";
import { RunNowChip } from "@/components/run-now-chip";
import { useChat } from "@/lib/use-chat";
import { cn } from "@/lib/utils";

const starters = [
  { icon: Sparkles, title: "Think something through", prompt: "Help me think through an idea:" },
  { icon: BookOpen, title: "Explore my knowledge", prompt: "Help me understand a concept:" },
];

export function ChatWorkspace() {
  const { messages, loading, statusText, sendMessage, clearMessages, stop, retryLast } = useChat();
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { liveVoice, liveVoiceAvailable, liveVoiceError, liveCaption, stopLiveVoice, toggleLiveVoice } = useAssistantVoice(sendMessage);
  const liveActive = liveVoice !== "idle" && liveVoice !== "error";
  const { state: voice, start: startVoice, stop: stopVoice, cancel: cancelVoice } = useVoiceRecorder({
    onTranscript: (transcript) => {
      const text = transcript.trim();
      if (!text) { toast.error("Didn't catch that. Try again."); return; }
      setInput((previous) => previous ? `${previous.trimEnd()} ${text}` : text);
      textareaRef.current?.focus();
    },
    onError: (message) => toast.error(message),
  });
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "end" });
  }, [messages, loading, statusText]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [input]);

  const submit = () => {
    if (!input.trim() || loading || voice !== "idle" || liveActive) return;
    void sendMessage(input);
    setInput("");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <section className="mx-auto flex min-h-[calc(100dvh-10rem)] w-full max-w-4xl flex-col">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border/70">
        <div className="flex items-center gap-2 text-sm font-medium">
          <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary"><Sparkles size={15} /></span>
          LifeOS Assistant
        </div>
        <button
          type="button"
          onClick={() => { void stopLiveVoice(); cancelVoice(); clearMessages(); setInput(""); }}
          disabled={!messages.length && !loading && voice === "idle" && !liveActive}
          className="inline-flex h-8 items-center gap-2 rounded-lg px-2.5 text-xs text-muted-foreground transition-transform duration-150 ease-[var(--ease-out-custom)] hover:bg-muted hover:text-foreground disabled:opacity-40 active:scale-[0.97]"
        >
          <Plus size={14} /> New chat
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col">
        {messages.length === 0 && !loading ? (
          <div className="flex flex-1 flex-col items-center justify-center px-4 pb-10 pt-16 text-center">
            <div className="mb-6 flex size-12 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary shadow-sm shadow-primary/10">
              <Sparkles size={21} />
            </div>
            <p className="mb-2 text-xs font-medium uppercase tracking-[0.16em] text-primary/80">Your LifeOS workspace</p>
            <h1 className="max-w-lg text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">What are we working through?</h1>
            <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">Ask a question, untangle an idea, or get something moving in LifeOS.</p>
            <div className="mt-8 grid w-full max-w-xl gap-2 sm:grid-cols-2">
              {starters.map(({ icon: Icon, title, prompt }) => (
                <button
                  key={title}
                  type="button"
                  onClick={() => { setInput(prompt); textareaRef.current?.focus(); }}
                  className="group flex min-h-16 items-center gap-3 rounded-xl border border-border/80 bg-card/70 px-4 text-left transition-transform duration-150 ease-[var(--ease-out-custom)] hover:-translate-y-0.5 hover:border-primary/30 hover:bg-card active:scale-[0.97]"
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary"><Icon size={16} /></span>
                  <span className="text-sm font-medium text-foreground">{title}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto px-1 sm:px-4" role="log" aria-live="polite" aria-label="Chat conversation">
            <div className="mx-auto flex max-w-3xl flex-col gap-7 py-8 sm:py-10">
              {messages.map((message) => (
                <article key={message.id} className={cn("flex gap-3 sm:gap-4", message.role === "user" && "flex-row-reverse")}>
                  {message.role === "assistant" && <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Sparkles size={14} /></div>}
                  <div className={cn("min-w-0 max-w-[88%]", message.role === "user" && "rounded-2xl bg-muted/80 px-4 py-3 sm:max-w-[78%]")}>
                    <p className="whitespace-pre-wrap text-[15px] leading-7 text-foreground">{message.content}</p>
                    {message.interrupted && (
                      <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                        <span>Response stopped</span>
                        {message.id === messages[messages.length - 1]?.id && !loading && <button onClick={retryLast} className="inline-flex items-center gap-1 font-medium text-primary transition-transform duration-150 ease-[var(--ease-out-custom)] hover:underline active:scale-[0.97]"><RotateCcw size={12} /> Retry</button>}
                      </div>
                    )}
                    {!!message.actions?.length && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {message.actions.map((action, index) => <span key={`${action.tool}-${index}`} className={cn("inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs", action.failed ? "border-destructive/25 text-destructive" : "border-primary/20 bg-primary/5 text-primary")}><Check size={12} />{action.summary}{action.confirm && <RunNowChip promptId={action.confirm.promptId} title={action.confirm.title} />}</span>)}
                      </div>
                    )}
                  </div>
                </article>
              ))}
              {loading && <div className="flex gap-3 sm:gap-4" aria-busy="true"><div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Sparkles size={14} /></div><p className="flex items-center gap-2 pt-1 text-sm text-muted-foreground"><LoaderCircle size={14} className="animate-spin" />{statusText || "Thinking"}</p></div>}
              <div ref={endRef} />
            </div>
          </div>
        )}

        <div className="sticky bottom-0 shrink-0 bg-background pb-2 pt-3">
          <div className="mx-auto max-w-3xl rounded-2xl border border-border bg-card shadow-[0_8px_28px_-16px_rgba(0,0,0,0.5)] focus-within:border-primary/35 focus-within:shadow-[0_10px_32px_-16px_rgba(107,142,121,0.32)]">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Message LifeOS Assistant"
              aria-label="Message LifeOS Assistant"
              rows={1}
              className="block max-h-[180px] min-h-12 w-full resize-none bg-transparent px-4 pt-3.5 text-sm leading-6 text-foreground outline-none placeholder:text-muted-foreground/80"
            />
            <div className="flex items-center justify-between px-2 pb-2 pt-1">
              <div className="flex items-center gap-1">
                <button type="button" onClick={voice === "recording" ? stopVoice : () => void startVoice()} disabled={liveActive || (voice !== "recording" && (loading || voice !== "idle"))} aria-label={voice === "recording" ? "Stop recording" : "Dictate a message"} title={voice === "recording" ? "Stop recording" : "Dictate a message"} className="flex size-9 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted transition-transform duration-150 ease-[var(--ease-out-custom)] active:scale-[0.97] disabled:opacity-40">
                  {voice === "recording" ? <Square size={14} className="text-destructive" /> : voice === "transcribing" ? <LoaderCircle size={16} className="animate-spin" /> : <Mic size={18} />}
                </button>
                <button type="button" onClick={() => void toggleLiveVoice()} disabled={!liveVoiceAvailable || (!liveActive && (loading || voice !== "idle")) || liveVoice === "connecting"} aria-label={liveActive ? "End voice conversation" : "Start voice conversation"} title={liveVoiceAvailable ? "Talk to LifeOS" : "Live voice is not configured"} className={cn("flex size-9 items-center justify-center rounded-xl transition-transform duration-150 ease-[var(--ease-out-custom)] active:scale-[0.97] disabled:opacity-40", liveActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>
                  {liveVoice === "connecting" ? <LoaderCircle size={16} className="animate-spin" /> : liveActive ? <Square size={14} /> : <Volume2 size={18} />}
                </button>
                <p role="status" className="pl-2 text-[11px] text-muted-foreground">{voice === "recording" ? "Recording" : voice === "transcribing" ? "Transcribing" : liveActive ? liveVoice === "listening" ? "Listening" : liveVoice === "speaking" ? "Speaking" : liveVoice === "thinking" ? "Thinking" : "Connecting" : ""}</p>
              </div>
              {loading ? (
                <button type="button" onClick={stop} aria-label="Stop response" className="flex size-9 items-center justify-center rounded-xl bg-foreground text-background transition-transform duration-150 ease-[var(--ease-out-custom)] active:scale-[0.97]"><Square size={14} fill="currentColor" /></button>
              ) : (
                <button type="button" onClick={submit} disabled={!input.trim() || voice !== "idle" || liveActive} aria-label="Send message" className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-[transform,opacity] duration-150 ease-[var(--ease-out-custom)] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"><ArrowUp size={18} /></button>
              )}
            </div>
          </div>
          {liveVoiceError && <p role="alert" className="mx-auto mt-2 max-w-3xl text-xs text-destructive">{liveVoiceError}</p>}
          {liveActive && liveCaption && <p aria-live="polite" className="mx-auto mt-2 max-w-3xl text-xs text-muted-foreground">{liveCaption}</p>}
          <p className="mx-auto mt-2 max-w-3xl text-center text-[10px] text-muted-foreground/70">Enter to send · Shift+Enter for a new line · <Link href="/knowledge" className="underline decoration-border underline-offset-2 hover:text-foreground">Explore knowledge</Link></p>
        </div>
      </div>
    </section>
  );
}

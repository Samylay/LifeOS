"use client";

import { CSSProperties, KeyboardEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { Activity01Icon, Settings01Icon } from "@hugeicons/core-free-icons";
import { ArrowDown, ArrowUp, Camera, Check, Copy, ImagePlus, LoaderCircle, Plus, RotateCcw, Sparkles, Square, Mic, X } from "lucide-react";
import { toast } from "sonner";
import { useVoiceRecorder } from "@/lib/use-voice-recorder";
import { RunNowChip } from "@/components/run-now-chip";
import { useChat } from "@/lib/use-chat";
import { cn } from "@/lib/utils";
import { PhotoInboxCapture } from "./photo-inbox-capture";
import { CameraCapture } from "./camera-capture";
import { CodexSessions } from "./codex-sessions";
import { FoodPhotoCard } from "./food-photo-card";
import { FoodDaySummary } from "./food-day-summary";
import { prepareChatPhoto } from "@/lib/prepare-chat-photo";
import { useVisualViewport } from "@/lib/use-visual-viewport";
import type { FoodPhoto } from "@/lib/food-model";
import { ChatMarkdown } from "./chat-markdown";

const starters = [
  { title: "Homelab status", prompt: "What's the status of my homelab?" },
  { title: "Add a Todoist task", prompt: "Add a task to Todoist: " },
  { title: "Task progress", prompt: "Check the progress of my tasks." },
  { title: "My finances", prompt: "How are my finances?" },
];

export function ChatWorkspace() {
  const { messages, photos, restoring, sendPhoto, updatePhoto, loading, statusText, sendMessage, clearMessages, stop, retryLast } = useChat(true);
  const [input, setInput] = useState("");
  const [draft, setDraft] = useState<{ file: File; url: string; id: string; eatenAt: string } | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const galleryRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);
  const [showLatest, setShowLatest] = useState(false);
  const viewport = useVisualViewport();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { state: voice, start: startVoice, stop: stopVoice, cancel: cancelVoice } = useVoiceRecorder({
    onTranscript: (transcript) => {
      const text = transcript.trim();
      if (!text) { toast.error("Didn't catch that. Try again."); return; }
      setInput((previous) => previous ? `${previous.trimEnd()} ${text}` : text);
      textareaRef.current?.focus();
    },
    onError: (message) => toast.error(message),
  });
  useEffect(() => {
    const el = scrollRef.current;
    if (el && pinnedRef.current) el.scrollTo({ top: el.scrollHeight, behavior: "instant" });
  }, [messages, photos, loading, statusText]);

  useEffect(() => () => { if (draft) URL.revokeObjectURL(draft.url); }, [draft]);
  const choosePhoto = async (file?: File) => {
    if (!file || preparing || uploading || loading || restoring) return;
    setPreparing(true);
    try {
      const prepared = await prepareChatPhoto(file);
      setDraft({ file: prepared, url: URL.createObjectURL(prepared), id: typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `photo-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`, eatenAt: new Date().toISOString() });
    } catch (error) { toast.error(error instanceof Error ? error.message : "Couldn't prepare this photo"); }
    finally { setPreparing(false); }
  };

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [input]);

  const submit = () => {
    if ((!input.trim() && !draft) || loading || restoring || uploading || preparing || voice !== "idle") return;
    pinnedRef.current = true;
    if (draft) {
      setUploading(true);
      void sendPhoto(draft.file, input, draft.id, draft.eatenAt, Intl.DateTimeFormat().resolvedOptions().timeZone).then(() => { setDraft(null); setInput(""); }).catch((error) => toast.error(error instanceof Error ? error.message : "Couldn't upload the photo. Try again.")).finally(() => setUploading(false));
      return;
    }
    void sendMessage(input);
    setInput("");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  const conversation = [
    ...messages.map((m) => ({ ...m, photo: undefined as FoodPhoto | undefined })),
    ...photos.map((photo) => ({ id: `photo-${photo.id}`, role: "user" as const, content: "", timestamp: new Date(photo.createdAt), photo, actions: undefined, interrupted: undefined })),
  ].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  return (
    <section className="chat-workspace mx-auto flex min-h-0 w-full max-w-4xl flex-col" style={viewport.ready ? { "--chat-viewport": `${viewport.height}px` } as CSSProperties : undefined}>
      <header className="flex h-14 shrink-0 items-center justify-between gap-1 border-b border-border/70 px-3 sm:px-4">
        <h1 className="min-w-0 truncate text-base font-semibold">Assistant</h1>
        <div className="flex items-center gap-1">
          <Link href="/status" aria-label="System" title="System" className="grid size-11 place-items-center rounded-lg text-muted-foreground transition-transform duration-[var(--dur-fast)] hover:bg-muted hover:text-foreground active:scale-[0.97] lg:hidden"><HugeiconsIcon icon={Activity01Icon} size={18} /></Link>
          <Link href="/settings" aria-label="Settings" title="Settings" className="grid size-11 place-items-center rounded-lg text-muted-foreground transition-transform duration-[var(--dur-fast)] hover:bg-muted hover:text-foreground active:scale-[0.97] lg:hidden"><HugeiconsIcon icon={Settings01Icon} size={18} /></Link>
          <CodexSessions /><PhotoInboxCapture compact /><button
          type="button"
          aria-label="New chat"
          title="New chat"
          onClick={() => { cancelVoice(); clearMessages(); setInput(""); setDraft(null); }}
          disabled={restoring || uploading || preparing || (!conversation.length && !loading && voice === "idle")}
          className="inline-flex size-11 items-center justify-center rounded-lg text-muted-foreground transition-transform duration-150 ease-[var(--ease-out-custom)] hover:bg-muted hover:text-foreground disabled:opacity-40 active:scale-[0.97]"
        ><Plus size={19} /></button></div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col">
        {conversation.length === 0 && !loading && !restoring ? (
          <div className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-4 py-6 text-center sm:py-10">
            <div className="flex min-h-0 flex-1 flex-col justify-center">
            <h2 className="max-w-lg text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">What would you like to do?</h2>
            <div className="mt-6 grid w-full max-w-xl gap-2 sm:grid-cols-2">
              {starters.map(({ title, prompt }) => (
                <button
                  key={title}
                  type="button"
                  onClick={() => { setInput(prompt); textareaRef.current?.focus(); }}
                  className="group flex min-h-14 items-center gap-3 rounded-xl border border-border/80 bg-card/70 px-4 text-left transition-transform duration-150 ease-[var(--ease-out-custom)] hover:border-primary/30 hover:bg-card active:scale-[0.97]"
                >
                  <span className="text-sm font-medium text-foreground">{title}</span>
                </button>
              ))}
            </div>
            </div>
          </div>
        ) : (
          <div data-content-scroll ref={scrollRef} onScroll={() => { const el = scrollRef.current; if (el) { pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; setShowLatest(!pinnedRef.current); } }} className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 sm:px-6" role="log" aria-live="polite" aria-label="Chat conversation">
            <div className="mx-auto flex max-w-3xl flex-col gap-6 py-4 sm:py-6">
              {restoring && <div className="space-y-5" aria-label="Loading conversation"><div className="h-14 w-3/4 animate-pulse rounded-2xl bg-muted" /><div className="h-20 w-full animate-pulse rounded-xl bg-muted/70" /><div className="h-12 w-2/3 animate-pulse rounded-2xl bg-muted" /></div>}
              <FoodDaySummary photos={photos} />
              {conversation.map((message) => (
                <article key={message.id} className={cn("group flex gap-3 sm:gap-4", message.role === "user" ? "flex-row-reverse" : "animate-in fade-in-0 duration-200 ease-[var(--ease-out-custom)]")}>
                  {message.role === "assistant" && <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Sparkles size={14} /></div>}
                  <div className={cn("min-w-0 flex-1", message.role === "user" && !message.photo && "max-w-[90%] flex-none rounded-2xl bg-muted/80 px-4 py-3 sm:max-w-[78%]")}>
                    {message.photo ? <FoodPhotoCard photo={message.photo} update={updatePhoto} /> : message.role === "assistant" ? <ChatMarkdown content={message.content} /> : <p className="whitespace-pre-wrap text-[15px] leading-7 text-foreground">{message.content}</p>}
                    {message.interrupted && (
                      <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                        <span>Response stopped</span>
                        {message.id === messages[messages.length - 1]?.id && !loading && <button onClick={retryLast} className="inline-flex items-center gap-1 font-medium text-primary transition-transform duration-150 ease-[var(--ease-out-custom)] hover:underline active:scale-[0.97]"><RotateCcw size={12} /> Retry</button>}
                      </div>
                    )}
                    {!!message.actions?.length && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {message.actions.map((action, index) => <details key={`${action.tool}-${index}`} className="group/action rounded-lg border border-border bg-card text-xs"><summary className={cn("flex cursor-pointer list-none items-center gap-1.5 rounded-lg px-2.5 py-1.5", action.failed ? "text-destructive" : "text-foreground")}><Check size={12} />{action.summary}</summary><div className="border-t border-border px-2.5 py-2 text-muted-foreground"><span>{action.tool}{action.count ? ` · ${action.count}` : ""}</span>{action.confirm && <RunNowChip promptId={action.confirm.promptId} title={action.confirm.title} />}</div></details>)}
                      </div>
                    )}
                    <div className={cn("mt-1 flex items-center gap-3 text-[11px] text-muted-foreground opacity-100 sm:opacity-0 sm:transition-opacity sm:duration-150 sm:ease-[var(--ease-out-custom)] sm:group-hover:opacity-100 sm:group-focus-within:opacity-100", message.role === "user" && "justify-end")}>
                      <time dateTime={message.timestamp.toISOString()}>{message.timestamp.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time>
                      <button type="button" onClick={() => void navigator.clipboard.writeText(message.content).then(() => toast.success("Copied"), () => toast.error("Couldn't copy message"))} aria-label="Copy message" className="inline-flex min-h-8 items-center gap-1 rounded px-1.5 hover:bg-muted active:scale-[0.97] transition-transform duration-150 ease-[var(--ease-out-custom)]"><Copy size={12} /><span>Copy</span></button>
                      {message.role === "assistant" && message.id === messages[messages.length - 1]?.id && <button type="button" onClick={retryLast} disabled={loading || !messages.some((item) => item.role === "user")} aria-label="Retry response" className="inline-flex min-h-8 items-center gap-1 rounded px-1.5 hover:bg-muted active:scale-[0.97] transition-transform duration-150 ease-[var(--ease-out-custom)] disabled:opacity-40"><RotateCcw size={12} /><span>Retry</span></button>}
                    </div>
                  </div>
                </article>
              ))}
              {loading && <div className="flex gap-3 sm:gap-4" aria-busy="true"><div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Sparkles size={14} /></div><div className="pt-1">{statusText ? <p className="animate-pulse text-sm text-muted-foreground">{statusText}</p> : <div className="flex h-6 items-center gap-1.5" aria-label="Assistant is thinking"><span className="size-1.5 animate-pulse rounded-full bg-muted-foreground" /><span className="size-1.5 animate-pulse rounded-full bg-muted-foreground [animation-delay:120ms]" /><span className="size-1.5 animate-pulse rounded-full bg-muted-foreground [animation-delay:240ms]" /></div>}</div></div>}
            </div>
            {showLatest && <button type="button" onClick={() => { pinnedRef.current = true; setShowLatest(false); scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }} className="sticky bottom-3 z-10 mx-auto flex min-h-10 items-center gap-2 rounded-full border border-border bg-card px-4 text-sm shadow-lg transition-transform duration-150 ease-[var(--ease-out-custom)] active:scale-[0.97]"><ArrowDown size={15} />Jump to latest</button>}
          </div>
        )}

        <div className="shrink-0 bg-background px-3 pb-2 pt-2 sm:px-4">
          <div className="mx-auto max-w-3xl rounded-2xl border border-border bg-card shadow-[0_8px_28px_-16px_rgba(0,0,0,0.5)] focus-within:border-primary/35 focus-within:shadow-[0_10px_32px_-16px_rgba(107,142,121,0.32)]">
            {draft && <div className="flex items-center gap-3 px-3 pt-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={draft.url} alt="Photo ready to send" className="size-16 rounded-lg object-cover" />
              <div className="min-w-0 flex-1"><p className="text-xs font-medium">Ready to log your meal</p><p className="text-[11px] text-muted-foreground">Add details below, or send the photo on its own.</p></div>
              <button type="button" aria-label="Remove photo" disabled={uploading} onClick={() => setDraft(null)} className="flex size-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted transition-transform duration-150 ease-[var(--ease-out-custom)] active:scale-[0.97]"><X size={16} /></button>
            </div>}
            {cameraOpen && <CameraCapture onClose={() => setCameraOpen(false)} onCapture={(file) => { setCameraOpen(false); void choosePhoto(file); }} onUnavailable={() => { setCameraOpen(false); cameraRef.current?.click(); }} />}
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" aria-label="Take a photo" className="hidden" onChange={(event) => { void choosePhoto(event.target.files?.[0]); event.target.value = ""; }} />
            <input ref={galleryRef} type="file" accept="image/*" aria-label="Choose a photo" className="hidden" onChange={(event) => { void choosePhoto(event.target.files?.[0]); event.target.value = ""; }} />
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={onKeyDown}
              onPaste={(event) => { const image = [...event.clipboardData.files].find((file) => file.type.startsWith("image/")); if (image) { event.preventDefault(); void choosePhoto(image); } }}
              disabled={uploading || restoring}
              placeholder={draft ? "Optional: ingredients, portion, eating time…" : "Message LifeOS…"}
              aria-label="Message LifeOS Assistant"
              rows={1}
              className="block max-h-[144px] min-h-12 w-full resize-none bg-transparent px-4 pt-3.5 text-sm leading-6 text-foreground outline-none placeholder:text-muted-foreground/80"
            />
            <div className="flex items-center justify-between px-2 pb-2 pt-1">
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => setCameraOpen(true)} disabled={restoring || uploading || preparing || loading} aria-label="Take a food photo" title="Take a food photo" className="flex size-11 items-center justify-center rounded-xl text-primary hover:bg-primary/10 transition-transform duration-150 ease-[var(--ease-out-custom)] active:scale-[0.97] disabled:opacity-40"><Camera size={20} /></button>
                <button type="button" onClick={() => galleryRef.current?.click()} disabled={restoring || uploading || preparing || loading} aria-label="Attach a photo" title="Attach a photo" className="flex size-11 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted transition-transform duration-150 ease-[var(--ease-out-custom)] active:scale-[0.97] disabled:opacity-40"><ImagePlus size={19} /></button>
                <button type="button" onClick={voice === "recording" ? stopVoice : () => void startVoice()} disabled={voice !== "recording" && (loading || voice !== "idle")} aria-label={voice === "recording" ? "Stop recording" : "Dictate a message"} title={voice === "recording" ? "Stop recording" : "Dictate a message"} className="flex size-11 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted transition-transform duration-150 ease-[var(--ease-out-custom)] active:scale-[0.97] disabled:opacity-40">
                  {voice === "recording" ? <Square size={14} className="text-destructive" /> : voice === "transcribing" ? <LoaderCircle size={16} className="animate-spin" /> : <Mic size={18} />}
                </button>
                <p role="status" className="pl-2 text-[11px] text-muted-foreground">{voice === "recording" ? "Recording" : voice === "transcribing" ? "Transcribing" : ""}</p>
              </div>
              {loading ? (
                <button type="button" onClick={stop} aria-label="Stop response" className="flex size-11 items-center justify-center rounded-xl bg-foreground text-background transition-transform duration-150 ease-[var(--ease-out-custom)] active:scale-[0.97]"><Square size={14} fill="currentColor" /></button>
              ) : (
                <button type="button" onClick={submit} disabled={(!input.trim() && !draft) || voice !== "idle" || restoring || uploading || preparing} aria-label={draft ? "Send photo" : "Send message"} className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-[transform,opacity] duration-150 ease-[var(--ease-out-custom)] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40">{uploading || preparing ? <LoaderCircle size={18} className="animate-spin" /> : <ArrowUp size={18} />}</button>
              )}
            </div>
          </div>
          {(uploading || preparing || restoring) && <p role="status" className="mx-auto mt-2 max-w-3xl text-center text-xs text-muted-foreground">{uploading ? "Uploading photo. Keep this page open until it is saved." : preparing ? "Preparing your photo" : "Loading your conversation"}</p>}
        </div>
      </div>
    </section>
  );
}

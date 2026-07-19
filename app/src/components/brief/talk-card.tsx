"use client";

import { useRef, useState } from "react";
import { CheckCircle2, Loader2, Mic, Square } from "lucide-react";
import type { PromptBody } from "@/lib/brief-types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type RecState = "idle" | "recording" | "transcribing" | "review" | "saving" | "done" | "error";

/**
 * The one bidirectional card: ALL of today's prompts (morning prompt +
 * objective continuity questions) as a single "things to talk about" list,
 * with ONE recorder. The whole take is saved as a `talk-session` entry;
 * classify.py splits the transcript across the listed topics and routes each
 * segment (objective logs / ideas / content candidates). Answering by Telegram
 * voice note lands in the same pipeline — this card and the bot are the only
 * two mouths of one funnel.
 */
export function TalkCard({ prompts, date }: { prompts: PromptBody[]; date: string }) {
  const [state, setState] = useState<RecState>("idle");
  const [transcript, setTranscript] = useState<string | null>(null);
  // T46: /api/voice already stashed this take durably; the id lets save
  // mark the pending row confirmed.
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [editedText, setEditedText] = useState("");
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Bracketed categories ride along into the saved note's quote line so the
  // classifier knows which topics were on the table.
  const topics = prompts.map((p) => `[${p.category}] ${p.prompt_text}`).join("\n");

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        await transcribe(new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" }));
      };
      recorderRef.current = rec;
      rec.start();
      setState("recording");
    } catch {
      setErrMsg("Microphone unavailable — check browser permissions.");
      setState("error");
    }
  };

  const stop = () => {
    recorderRef.current?.stop();
    setState("transcribing");
  };

  const transcribe = async (blob: Blob) => {
    try {
      const form = new FormData();
      form.append("audio", blob, "note.webm");
      const res = await fetch("/api/voice", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
      setTranscript(data.transcript);
      setPendingId(typeof data.pendingId === "string" ? data.pendingId : null);
      setEditedText(data.transcript);
      setState("review");
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : "Transcription failed");
      setState("error");
    }
  };

  const save = async () => {
    const text = editedText.trim();
    if (!text) {
      setErrMsg("Can't save an empty note.");
      setState("error");
      return;
    }
    setState("saving");
    try {
      const res = await fetch("/api/voice/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: text,
          prompt: topics,
          category: "talk-session",
          date,
          pendingId: pendingId ?? undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
      setSavedNote(data.note);
      setState("done");
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : "Save failed");
      setState("error");
    }
  };

  const discard = () => {
    setTranscript(null);
    setEditedText("");
    setState("idle");
  };

  return (
    <div className="space-y-3">
      <ul className="space-y-1.5">
        {prompts.map((p) => (
          <li key={p.category} className="flex gap-2 text-sm leading-relaxed text-foreground">
            <span aria-hidden className="text-primary">•</span>
            <span className="italic">{p.prompt_text}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground/70">
        One take covers everything — it gets split and routed per topic. A Telegram
        voice note to the bot works too.
      </p>

      {state !== "review" && (
        <div className="flex items-center gap-3">
          {state === "recording" ? (
            <Button onClick={stop} variant="destructive" size="sm" className="gap-2 text-sm font-medium">
              <Square size={14} /> Stop
            </Button>
          ) : (
            <Button
              onClick={start}
              disabled={state === "transcribing" || state === "saving"}
              size="sm"
              className="gap-2 text-sm font-medium bg-accent text-accent-foreground hover:bg-accent/80"
            >
              {state === "transcribing"
                ? <><Loader2 size={14} className="animate-spin" /> Transcribing…</>
                : <><Mic size={14} /> {state === "done" ? "Record another" : "Record"}</>}
            </Button>
          )}
          {state === "recording" && (
            <span className="flex items-center gap-1.5 text-xs text-destructive">
              <span className="h-2 w-2 rounded-full animate-pulse bg-destructive" />
              recording…
            </span>
          )}
        </div>
      )}

      {state === "review" && (
        <div className="space-y-2">
          <Textarea
            value={editedText}
            onChange={(e) => setEditedText(e.target.value)}
            rows={6}
            className="w-full text-sm"
            autoFocus
          />
          <div className="flex items-center gap-2">
            <Button onClick={save} size="sm" className="text-sm font-medium bg-accent text-accent-foreground hover:bg-accent/80">
              Save
            </Button>
            <Button onClick={discard} variant="secondary" size="sm" className="text-sm font-medium">
              Discard &amp; re-record
            </Button>
          </div>
        </div>
      )}

      {state === "saving" && (
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 size={13} className="animate-spin" /> saving…
        </span>
      )}

      {state === "done" && transcript && (
        <div className="rounded-lg p-3 text-sm space-y-1.5 bg-muted">
          <div className="flex items-center gap-1.5 text-xs text-emerald-500">
            <CheckCircle2 size={13} /> saved to {savedNote}
          </div>
          <p className="text-muted-foreground">{editedText}</p>
        </div>
      )}
      {state === "error" && errMsg && (
        <p className="text-xs text-destructive">{errMsg}</p>
      )}
    </div>
  );
}

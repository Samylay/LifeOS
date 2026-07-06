"use client";

import { useRef, useState } from "react";
import { CheckCircle2, Loader2, Mic, Square } from "lucide-react";
import type { PromptBody } from "@/lib/brief-types";

type RecState = "idle" | "recording" | "transcribing" | "review" | "saving" | "done" | "error";

/**
 * The one bidirectional card: shows the rotating prompt, records voice via
 * MediaRecorder, POSTs the audio to /api/voice which transcribes it (local
 * Whisper on the host). The transcript is shown for editing before the user
 * confirms — /api/voice/save then appends the final text to the dated vault
 * inbox note.
 */
export function PromptCard({ body, date }: { body: PromptBody; date: string }) {
  const [state, setState] = useState<RecState>("idle");
  const [transcript, setTranscript] = useState<string | null>(null);
  const [editedText, setEditedText] = useState("");
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

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
        body: JSON.stringify({ transcript: text, prompt: body.prompt_text, category: body.category, date }),
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
      <p className="text-sm leading-relaxed italic" style={{ color: "var(--text-primary)" }}>
        &quot;{body.prompt_text}&quot;
      </p>

      {state !== "review" && (
        <div className="flex items-center gap-3">
          {state === "recording" ? (
            <button onClick={stop}
              className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium"
              style={{ background: "#EF4444", color: "white" }}>
              <Square size={14} /> Stop
            </button>
          ) : (
            <button onClick={start} disabled={state === "transcribing" || state === "saving"}
              className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium"
              style={{ background: "var(--accent-bg)", color: "var(--accent)" }}>
              {state === "transcribing"
                ? <><Loader2 size={14} className="animate-spin" /> Transcribing…</>
                : <><Mic size={14} /> {state === "done" ? "Record another" : "Record answer"}</>}
            </button>
          )}
          {state === "recording" && (
            <span className="flex items-center gap-1.5 text-xs" style={{ color: "#EF4444" }}>
              <span className="h-2 w-2 rounded-full animate-pulse" style={{ background: "#EF4444" }} />
              recording…
            </span>
          )}
        </div>
      )}

      {state === "review" && (
        <div className="space-y-2">
          <textarea
            value={editedText}
            onChange={(e) => setEditedText(e.target.value)}
            rows={4}
            className="w-full rounded-lg p-3 text-sm"
            style={{ background: "var(--bg-tertiary)", color: "var(--text-primary)", border: "1px solid var(--border-primary)" }}
            autoFocus
          />
          <div className="flex items-center gap-2">
            <button onClick={save}
              className="rounded-lg px-4 py-2 text-sm font-medium"
              style={{ background: "var(--accent-bg)", color: "var(--accent)" }}>
              Save
            </button>
            <button onClick={discard}
              className="rounded-lg px-4 py-2 text-sm font-medium"
              style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}>
              Discard & re-record
            </button>
          </div>
        </div>
      )}

      {state === "saving" && (
        <span className="flex items-center gap-1.5 text-xs" style={{ color: "var(--text-secondary)" }}>
          <Loader2 size={13} className="animate-spin" /> saving…
        </span>
      )}

      {state === "done" && transcript && (
        <div className="rounded-lg p-3 text-sm space-y-1.5" style={{ background: "var(--bg-tertiary)" }}>
          <div className="flex items-center gap-1.5 text-xs" style={{ color: "#22C55E" }}>
            <CheckCircle2 size={13} /> saved to {savedNote}
          </div>
          <p style={{ color: "var(--text-secondary)" }}>{editedText}</p>
        </div>
      )}
      {state === "error" && errMsg && (
        <p className="text-xs" style={{ color: "#EF4444" }}>{errMsg}</p>
      )}
    </div>
  );
}

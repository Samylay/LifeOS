"use client";

// Shared voice-capture hook: MediaRecorder → /api/voice (whisper) →
// transcript. Used by the /decide deck (verdicts) and the chat Assistant
// (dictation). The caller decides what a transcript means; the hook stays in
// "transcribing" until the caller's onTranscript settles, so consumers can
// run their own interpretation step under the same busy state.
import { useCallback, useRef, useState } from "react";

export type VoiceRecorderState = "idle" | "recording" | "transcribing";

export function useVoiceRecorder(opts: {
  onTranscript: (transcript: string) => void | Promise<void>;
  onError: (message: string) => void;
}) {
  const [state, setState] = useState<VoiceRecorderState>("idle");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  // Keep the latest callbacks without re-creating start/stop.
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = (ev) => ev.data.size > 0 && chunksRef.current.push(ev.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setState("transcribing");
        try {
          const form = new FormData();
          form.append(
            "audio",
            new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" }),
            "capture.webm"
          );
          const res = await fetch("/api/voice", { method: "POST", body: form });
          const data = await res.json();
          if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
          await optsRef.current.onTranscript(String(data.transcript ?? ""));
        } catch (err) {
          optsRef.current.onError(err instanceof Error ? err.message : "voice capture failed");
        } finally {
          setState("idle");
        }
      };
      recorderRef.current = rec;
      rec.start();
      setState("recording");
    } catch {
      optsRef.current.onError("Microphone unavailable — check browser permissions.");
    }
  }, []);

  const stop = useCallback(() => recorderRef.current?.stop(), []);

  return { state, start, stop };
}

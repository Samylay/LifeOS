"use client";

import { useEffect, useRef } from "react";
import { Mic, MicOff } from "lucide-react";
import { useVoiceInput } from "@/lib/use-voice-input";

interface VoiceMicButtonProps {
  /** Called once with the final transcript when recording ends. */
  onResult: (transcript: string) => void;
  /** Larger, thumb-friendly variant for mobile assistant view. */
  large?: boolean;
}

/**
 * Mic button that records via the Web Speech API and submits the final
 * transcript through `onResult` when recording stops. Shows a live
 * transcript bubble while listening, and a small notice if voice input is
 * unavailable (unsupported browser or insecure context / plain http).
 */
export function VoiceMicButton({ onResult, large = false }: VoiceMicButtonProps) {
  const {
    isListening,
    transcript,
    isSupported,
    startListening,
    stopListening,
    resetTranscript,
  } = useVoiceInput();

  const hadTranscriptRef = useRef(false);

  useEffect(() => {
    if (transcript) hadTranscriptRef.current = true;
  }, [transcript]);

  // When recognition ends and we have a final transcript, submit it.
  useEffect(() => {
    if (!isListening && hadTranscriptRef.current && transcript.trim()) {
      const text = transcript.trim();
      hadTranscriptRef.current = false;
      onResult(text);
      resetTranscript();
    }
  }, [isListening, transcript, onResult, resetTranscript]);

  const handleToggle = () => {
    if (isListening) {
      stopListening();
    } else {
      hadTranscriptRef.current = false;
      resetTranscript();
      startListening();
    }
  };

  // Detect insecure context separately so we can show a helpful message
  // rather than just hiding the button.
  const insecure =
    typeof window !== "undefined" &&
    window.location.protocol !== "https:" &&
    window.location.hostname !== "localhost";

  if (!isSupported) {
    return (
      <div
        className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs"
        style={{ background: "var(--bg-tertiary)", color: "var(--text-tertiary)" }}
        title={insecure ? "Voice needs HTTPS — enable Tailscale Serve" : "Voice not supported in this browser"}
      >
        <MicOff size={large ? 18 : 14} />
        {large && <span>{insecure ? "Voice needs HTTPS — enable Tailscale Serve" : "Voice unavailable"}</span>}
      </div>
    );
  }

  const size = large ? 56 : 36;
  const iconSize = large ? 24 : 16;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleToggle}
        className="relative flex items-center justify-center rounded-full transition-all shrink-0"
        style={{
          width: size,
          height: size,
          background: isListening ? "#EF444420" : "var(--accent)",
          border: isListening ? "1px solid #EF444460" : "none",
          color: isListening ? "#EF4444" : "white",
        }}
        title={isListening ? "Stop recording" : "Voice command"}
      >
        {isListening ? <MicOff size={iconSize} /> : <Mic size={iconSize} />}
        {isListening && (
          <span
            className="absolute inset-0 rounded-full"
            style={{
              border: "2px solid #EF4444",
              animation: "voicePulse 1.5s ease-out infinite",
            }}
          />
        )}
      </button>

      {isListening && (
        <div
          className="absolute bottom-full mb-2 right-0 rounded-lg px-3 py-2 text-xs font-medium max-w-[240px] whitespace-normal"
          style={{
            background: "var(--bg-elevated, var(--bg-secondary))",
            border: "1px solid var(--border-primary)",
            boxShadow: "var(--shadow-md)",
            color: "var(--text-primary)",
            zIndex: 50,
          }}
        >
          <Mic size={10} className="inline mr-1" style={{ color: "#EF4444" }} />
          {transcript || "Listening..."}
        </div>
      )}
    </div>
  );
}

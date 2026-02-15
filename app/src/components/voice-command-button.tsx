"use client";

import { useState, useCallback, useEffect } from "react";
import { Mic, MicOff, Loader2 } from "lucide-react";
import { useVoiceInput } from "@/lib/use-voice-input";
import { parseCommand, type ParsedCommand } from "@/lib/command-parser";
import { ChangePreview } from "@/components/change-preview";
import type { Task } from "@/lib/types";

interface VoiceCommandButtonProps {
  tasks: Task[];
  onDelete: (id: string) => void;
  onUpdate: (id: string, data: Partial<Task>) => void;
  onCreate: (data: Omit<Task, "id" | "createdAt" | "updatedAt">) => void;
  /** Small button variant for topbar */
  compact?: boolean;
}

export function VoiceCommandButton({
  tasks,
  onDelete,
  onUpdate,
  onCreate,
  compact = false,
}: VoiceCommandButtonProps) {
  const {
    isListening,
    transcript,
    isSupported,
    startListening,
    stopListening,
    resetTranscript,
  } = useVoiceInput();

  const [pendingCommand, setPendingCommand] = useState<ParsedCommand | null>(
    null
  );
  const [processing, setProcessing] = useState(false);

  // When transcript is finalized (listening stops and we have text), parse command
  useEffect(() => {
    if (!isListening && transcript && !pendingCommand) {
      setProcessing(true);
      // Small delay for UX
      const timer = setTimeout(() => {
        const cmd = parseCommand(transcript, tasks);
        if (cmd) {
          setPendingCommand(cmd);
        }
        setProcessing(false);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isListening, transcript, tasks, pendingCommand]);

  const handleToggle = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      resetTranscript();
      setPendingCommand(null);
      startListening();
    }
  }, [isListening, startListening, stopListening, resetTranscript]);

  const handleConfirm = useCallback(() => {
    if (!pendingCommand) return;

    switch (pendingCommand.action) {
      case "delete":
        pendingCommand.matchedTaskIds.forEach((id) => onDelete(id));
        break;
      case "complete":
        pendingCommand.matchedTaskIds.forEach((id) =>
          onUpdate(id, { status: "done" })
        );
        break;
      case "start":
        pendingCommand.matchedTaskIds.forEach((id) =>
          onUpdate(id, { status: "in_progress" })
        );
        break;
      case "cancel":
        pendingCommand.matchedTaskIds.forEach((id) =>
          onUpdate(id, { status: "cancelled" })
        );
        break;
      case "reopen":
        pendingCommand.matchedTaskIds.forEach((id) =>
          onUpdate(id, { status: "todo" })
        );
        break;
      case "set_priority":
        if (pendingCommand.priority) {
          pendingCommand.matchedTaskIds.forEach((id) =>
            onUpdate(id, { priority: pendingCommand.priority })
          );
        }
        break;
      case "set_area":
        if (pendingCommand.area) {
          pendingCommand.matchedTaskIds.forEach((id) =>
            onUpdate(id, { area: pendingCommand.area })
          );
        }
        break;
      case "create":
        onCreate({
          title: pendingCommand.newTitle || "New task",
          priority: pendingCommand.priority || "medium",
          status: "todo",
          area: pendingCommand.area,
        });
        break;
    }

    setPendingCommand(null);
    resetTranscript();
  }, [pendingCommand, onDelete, onUpdate, onCreate, resetTranscript]);

  const handleCancel = useCallback(() => {
    setPendingCommand(null);
    resetTranscript();
  }, [resetTranscript]);

  if (!isSupported) return null;

  return (
    <>
      {/* Mic button */}
      <div className="relative">
        <button
          onClick={handleToggle}
          className="relative flex items-center justify-center rounded-lg transition-all"
          style={{
            width: compact ? 36 : 44,
            height: compact ? 36 : 44,
            background: isListening ? "#EF444420" : "var(--bg-tertiary)",
            border: isListening
              ? "1px solid #EF444460"
              : "1px solid var(--border-primary)",
            color: isListening ? "#EF4444" : "var(--text-secondary)",
          }}
          title={isListening ? "Stop listening" : "Voice command"}
        >
          {processing ? (
            <Loader2 size={compact ? 16 : 20} className="animate-spin" />
          ) : isListening ? (
            <MicOff size={compact ? 16 : 20} />
          ) : (
            <Mic size={compact ? 16 : 20} />
          )}
          {/* Listening pulse ring */}
          {isListening && (
            <span
              className="absolute inset-0 rounded-lg"
              style={{
                border: "2px solid #EF4444",
                animation: "voicePulse 1.5s ease-out infinite",
              }}
            />
          )}
        </button>

        {/* Live transcript bubble */}
        {(isListening || (processing && transcript)) && transcript && (
          <div
            className="absolute top-full mt-2 left-1/2 -translate-x-1/2 rounded-lg px-3 py-2 text-xs font-medium whitespace-nowrap max-w-xs truncate"
            style={{
              background: "var(--bg-elevated, var(--bg-secondary))",
              border: "1px solid var(--border-primary)",
              boxShadow: "var(--shadow-md)",
              color: "var(--text-primary)",
              zIndex: 50,
            }}
          >
            <Mic
              size={10}
              className="inline mr-1"
              style={{ color: "#EF4444" }}
            />
            {transcript}
          </div>
        )}
      </div>

      {/* Change preview overlay */}
      {pendingCommand && (
        <ChangePreview
          command={pendingCommand}
          tasks={tasks}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      )}
    </>
  );
}

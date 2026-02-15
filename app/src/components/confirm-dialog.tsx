"use client";

import { useEffect, useRef } from "react";
import { AlertTriangle } from "lucide-react";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  destructive = true,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) {
      cancelRef.current?.focus();
      const handleEsc = (e: KeyboardEvent) => {
        if (e.key === "Escape") onCancel();
      };
      document.addEventListener("keydown", handleEsc);
      return () => document.removeEventListener("keydown", handleEsc);
    }
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0, 0, 0, 0.5)" }}
      onClick={onCancel}
    >
      <div
        className="rounded-xl p-6 max-w-sm w-full mx-4"
        style={{
          background: "var(--bg-secondary)",
          border: "1px solid var(--border-primary)",
          boxShadow: "var(--shadow-lg)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-3">
          {destructive && (
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
              style={{ background: "#EF444415" }}
            >
              <AlertTriangle size={20} style={{ color: "#EF4444" }} />
            </div>
          )}
          <h3 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
            {title}
          </h3>
        </div>
        <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>
          {message}
        </p>
        <div className="flex justify-end gap-2">
          <button
            ref={cancelRef}
            onClick={onCancel}
            className="rounded-lg px-4 py-2 text-sm font-medium transition-colors"
            style={{
              background: "var(--bg-tertiary)",
              color: "var(--text-secondary)",
            }}
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className="rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors"
            style={{
              background: destructive ? "#EF4444" : "var(--accent)",
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

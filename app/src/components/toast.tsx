"use client";

import { useState, useEffect, useCallback, createContext, useContext } from "react";
import { Check, X, AlertTriangle, Info } from "lucide-react";

type ToastType = "success" | "error" | "warning" | "info";

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

let toastId = 0;

export function useToast() {
  return useContext(ToastContext);
}

const ICONS: Record<ToastType, React.ReactNode> = {
  success: <Check size={14} />,
  error: <X size={14} />,
  warning: <AlertTriangle size={14} />,
  info: <Info size={14} />,
};

const COLORS: Record<ToastType, { bg: string; border: string; text: string }> = {
  success: { bg: "#7C9E8A15", border: "#7C9E8A40", text: "#7C9E8A" },
  error: { bg: "#EF444415", border: "#EF444440", text: "#EF4444" },
  warning: { bg: "#F59E0B15", border: "#F59E0B40", text: "#F59E0B" },
  info: { bg: "#3B82F615", border: "#3B82F640", text: "#3B82F6" },
};

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  const color = COLORS[toast.type];

  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), 3000);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  return (
    <div
      className="flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium shadow-lg animate-slide-in"
      style={{
        background: "var(--bg-secondary)",
        border: `1px solid ${color.border}`,
        boxShadow: "var(--shadow-lg)",
      }}
    >
      <span style={{ color: color.text }}>{ICONS[toast.type]}</span>
      <span style={{ color: "var(--text-primary)" }}>{toast.message}</span>
      <button
        onClick={() => onDismiss(toast.id)}
        className="ml-2 p-0.5 rounded hover:opacity-70"
        style={{ color: "var(--text-tertiary)" }}
      >
        <X size={12} />
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, type: ToastType = "success") => {
    const id = ++toastId;
    setToasts((prev) => [...prev, { id, message, type }]);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast: addToast }}>
      {children}
      {/* Toast container */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2" style={{ maxWidth: 360 }}>
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={dismissToast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

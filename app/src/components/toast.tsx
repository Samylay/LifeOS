"use client";

// Thin compatibility shim over Sonner (interaction-craft house toast, T36).
// Existing callers keep using `const { toast } = useToast(); toast("msg", "success")`
// — this routes them through Sonner's pre-tuned <Toaster> mounted in the root layout.
import { toast as sonnerToast } from "sonner";

type ToastType = "success" | "error" | "warning" | "info";

function toast(message: string, type: ToastType = "success") {
  switch (type) {
    case "error":
      return sonnerToast.error(message);
    case "warning":
      return sonnerToast.warning(message);
    case "info":
      return sonnerToast.info(message);
    default:
      return sonnerToast.success(message);
  }
}

export function useToast() {
  return { toast };
}

// No-op provider kept so existing <ToastProvider> mounts don't need touching.
export function ToastProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

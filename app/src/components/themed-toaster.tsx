"use client";

import { Toaster } from "sonner";

// Dark-only app: pin Sonner to dark rather than `theme="system"`, which would
// hand light toasts to an OS-light phone.
export function ThemedToaster() {
  return <Toaster position="bottom-right" theme="dark" richColors closeButton />;
}

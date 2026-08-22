"use client";

import { Toaster } from "sonner";

// Dark-only app: pin Sonner to dark rather than `theme="system"`, which would
// hand light toasts to an OS-light phone.
//
// Toast entry (UI-MODERN-SPEC M5): slide+spring in from bottom-right.
// Sonner animates via CSS transforms on [data-sonner-toast], so we override
// its lift/gap timing vars with a spring-ish cubic-bezier — transform-only,
// collapsed to near-zero duration under prefers-reduced-motion (globals.css).
export function ThemedToaster() {
  return (
    <Toaster
      position="bottom-right"
      theme="dark"
      richColors
      closeButton
      toastOptions={{
        style: {
          transition:
            "transform 250ms var(--ease-out-custom), opacity 250ms var(--ease-out-custom)",
        },
      }}
    />
  );
}

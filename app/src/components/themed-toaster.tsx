"use client";

import { useEffect, useState } from "react";
import { Toaster } from "sonner";

// Sonner's `theme="system"` follows the OS, but the app's theme is class-driven
// with dark as the default (pre-paint script in layout.tsx) — an OS-light phone
// would get light toasts on a dark UI. Follow the <html> class instead.
export function ThemedToaster() {
  const [theme, setTheme] = useState<"light" | "dark">("dark");

  useEffect(() => {
    const root = document.documentElement;
    const read = () => setTheme(root.classList.contains("light") ? "light" : "dark");
    read();
    const observer = new MutationObserver(read);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return <Toaster position="bottom-right" theme={theme} richColors closeButton />;
}

import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { ThemedToaster } from "@/components/themed-toaster";

export const metadata: Metadata = {
  title: "LifeOS",
  description: "The system that gets out of your way.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "LifeOS",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Pinch zoom stays enabled (WCAG 1.4.4); iOS input auto-zoom is prevented
  // by the 16px mobile form-control rule in globals.css instead.
  // Let the soft keyboard shrink the layout viewport so `dvh`/`vh` account for
  // it (Android Chrome). iOS Safari ignores this — the chat panel measures
  // `visualViewport` via useVisualViewport() to stay correct there too.
  interactiveWidget: "resizes-content",
  // Dark-only app: browser chrome always matches the dark ground.
  themeColor: "#080A10",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      {/* Dark-only: the .dark class is server-rendered so the shadcn token
          layer and `dark:` utilities always apply. */}
      <head>
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body className="antialiased">
        {/* Must precede <Providers>: Sonner's <Toaster> only receives toasts
            published after it subscribes (in an effect) and never replays
            missed ones. Effects run in tree order, so mounted last it
            subscribed after every page/provider mount effect — a toast fired
            during first load was silently dropped. The outlet is
            position:fixed, so DOM order doesn't affect layout. */}
        <ThemedToaster />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

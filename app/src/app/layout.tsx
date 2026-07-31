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
  // Dark is the app default; the sage accent (#7C9E8A) matched neither ground.
  // Browser chrome follows the OS since a meta tag can't read localStorage.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F5F2EE" },
    { media: "(prefers-color-scheme: dark)", color: "#0F0E0D" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="apple-touch-icon" href="/icon-192.png" />
        {/* Apply the effective theme class before first paint. Dark is the
            default: with no stored preference we apply "dark" regardless of the
            OS setting. Only an explicit stored "light" stays light, and the
            explicit "system" choice resolves to the OS preference. The .dark
            class must be present whenever dark is active so the shadcn token
            layer and `dark:` utilities key off it. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              'try{var t=localStorage.getItem("lifeos-theme");if(t==="system")t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";else if(t!=="light"&&t!=="dark")t="dark";document.documentElement.classList.add(t)}catch(e){}',
          }}
        />
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

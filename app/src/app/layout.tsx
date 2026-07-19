import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { Toaster } from "sonner";

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
  themeColor: "#7C9E8A",
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
        {/* Apply the effective theme class before first paint. The .dark class
            must always be present when dark is active (stored OR system) so the
            shadcn token layer and `dark:` utilities key off it. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              'try{var t=localStorage.getItem("lifeos-theme");if(t!=="light"&&t!=="dark")t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.classList.add(t)}catch(e){}',
          }}
        />
      </head>
      <body className="antialiased">
        <Providers>{children}</Providers>
        <Toaster position="bottom-right" theme="system" richColors closeButton />
      </body>
    </html>
  );
}

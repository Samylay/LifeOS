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
        {/* Apply the persisted theme class before first paint. globals.css
            resolves "system" via prefers-color-scheme when no class is set. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              'try{var t=localStorage.getItem("lifeos-theme");if(t==="light"||t==="dark")document.documentElement.classList.add(t)}catch(e){}',
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

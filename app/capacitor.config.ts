// Capacitor config for the native Android wrapper. server.url points the
// WebView at the live LifeOS UI on the tailnet; nothing from the Next.js build
// is bundled. webDir is only the offline fallback stub in mobile/www.
type CapacitorConfig = {
  appId: string;
  appName: string;
  webDir: string;
  server?: { url?: string; allowNavigation?: string[] };
};

const HOST = "homelab.tail069527.ts.net";

const config: CapacitorConfig = {
  appId: "com.samylayaida.lifeos",
  appName: "LifeOS",
  webDir: "mobile/www",
  server: {
    url: `https://${HOST}`,
    allowNavigation: [HOST],
  },
};

export default config;

// Capacitor config for the native Android wrapper (ROADMAP T18b).
// server.url points the WebView at the LIVE LifeOS UI behind the Cloudflare
// Tunnel — nothing is bundled from the Next.js build; webDir is only the
// offline fallback stub in mobile/www. Auth (Cloudflare Access Service
// Token headers) is handled natively — see
// android/app/src/main/java/com/samylayaida/lifeos/CfAccess.java.
import { APP_URL, appHost } from "./src/lib/mobile/cf-access";

// Structural subset of @capacitor/cli's CapacitorConfig. The CLI is not a
// package.json dependency (only @capacitor/core + @capacitor/android are
// approved — CI runs the CLI via a pinned `npx`), so importing its type here
// would break `next build`'s typecheck. android-consistency.test.ts asserts
// the config the CLI actually generates from this file.
type CapacitorConfig = {
  appId: string;
  appName: string;
  webDir: string;
  server?: { url?: string; allowNavigation?: string[] };
};

const config: CapacitorConfig = {
  appId: "com.samylayaida.lifeos",
  appName: "LifeOS",
  webDir: "mobile/www",
  server: {
    url: APP_URL,
    allowNavigation: [appHost()],
  },
};

export default config;

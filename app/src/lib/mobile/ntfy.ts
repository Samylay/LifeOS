// Native ntfy push for the LifeOS Android app (replaces the standalone ntfy
// Android app — decision 2026-07-09, resolves ROADMAP T17b's routing half).
//
// The homelab's self-hosted ntfy instance (tailnet-only, plain HTTP — the
// phone reaches it over Tailscale, same as the standalone ntfy app did) is
// the underlying transport: LifeOS's /api/notify keeps publishing to the
// `homelab` topic exactly as before. The app subscribes natively:
// NtfyService.java holds a persistent connection to the topic's JSON stream
// from a foreground service and renders each message as a LifeOS-branded
// Android notification that opens /pager on tap.
//
// This module is the single source of truth for the endpoint, channel ids
// and priority mapping; ntfy-consistency.test.ts asserts the Java service
// and the AndroidManifest stay in sync with it, the same pattern as
// cf-access.ts / CfAccess.java.

/** Self-hosted ntfy instance — tailnet IP, plain HTTP (ntfy serves no TLS;
 * the manifest's network security config permits cleartext for exactly this
 * host and nothing else — the WebView's app URL stays HTTPS-only). */
export const NTFY_BASE_URL = "http://100.124.149.101:8096";

/** The single homelab topic every notifier publishes to. */
export const NTFY_TOPIC = "homelab";

/** In-app path a tapped notification opens (intent extra -> WebView). */
export const PAGER_PATH = "/pager";

/** Intent extra key carrying the path MainActivity should navigate to. */
export const OPEN_PATH_EXTRA = "com.samylayaida.lifeos.OPEN_PATH";

/**
 * ntfy JSON-stream subscribe URL. `sinceId` (the last message id we
 * rendered, persisted across reconnects/restarts) makes ntfy replay
 * anything missed while disconnected; without it, only new messages flow.
 */
export function subscribeUrl(sinceId?: string | null): string {
  const base = `${NTFY_BASE_URL}/${NTFY_TOPIC}/json`;
  return sinceId ? `${base}?since=${encodeURIComponent(sinceId)}` : base;
}

/** Android notification channels. One low-importance channel keeps the
 * foreground service's mandatory persistent notification quiet; message
 * channels map ntfy priorities so `page` severity heads-ups and `low`
 * severity stays silent — mirroring /api/notify's NTFY_PRIORITY table. */
export const CHANNEL_SERVICE = "ntfy_service";
export const CHANNEL_URGENT = "pager_urgent";
export const CHANNEL_DEFAULT = "pager_default";
export const CHANNEL_LOW = "pager_low";

/** ntfy priority (1=min … 5=urgent/max, 3=default when absent) -> channel.
 * Same thresholds in NtfyService.channelForPriority(). */
export function channelForPriority(priority: number): string {
  if (priority >= 4) return CHANNEL_URGENT;
  if (priority <= 2) return CHANNEL_LOW;
  return CHANNEL_DEFAULT;
}

export type NtfyMessage = {
  id: string;
  time: number;
  title: string | null;
  message: string;
  priority: number;
};

/**
 * Parse one line of the ntfy JSON stream. Returns null for anything that
 * is not a renderable message: keepalives, open events, malformed lines,
 * messages with no id or body. Mirrored by NtfyService.parseEvent() —
 * the stream also carries `open` and `keepalive` events that must never
 * become notifications.
 */
export function parseNtfyEvent(line: string): NtfyMessage | null {
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  if (o.event !== "message") return null;
  const id = typeof o.id === "string" ? o.id : "";
  const message = typeof o.message === "string" ? o.message : "";
  if (!id || !message) return null;
  return {
    id,
    time: typeof o.time === "number" ? o.time : 0,
    title: typeof o.title === "string" && o.title ? o.title : null,
    message,
    priority: typeof o.priority === "number" ? o.priority : 3,
  };
}

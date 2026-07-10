// Cloudflare Access Service Token wiring for the Capacitor Android app
// (ROADMAP T18b). The native WebView wraps the live LifeOS UI at the
// Cloudflare Tunnel domain; a scoped Access Service Token (Client ID +
// Client Secret pair) sent as request headers bypasses the interactive
// email-OTP login.
//
// This module is the single source of truth for the URL and header names:
// capacitor.config.ts imports it, and android-consistency.test.ts asserts
// the generated native project (build.gradle env plumbing, CfAccess.java)
// stays in sync with it. The real token values are NEVER present here or
// anywhere in the repo — they come from the CF_ACCESS_CLIENT_ID /
// CF_ACCESS_CLIENT_SECRET env vars at APK build time only.

/** The live LifeOS web UI the APK wraps — Cloudflare Tunnel domain, never
 * the tailnet IP (Samy's phone can't resolve .ts.net names, and the tunnel
 * gives normal public HTTPS with no cleartext-traffic config). */
export const APP_URL = "https://lab.samylayaida.com";

/** Env var names the build reads the Service Token from (CI secrets or a
 * local shell). Same names everywhere: gradle, CI workflow, docs. */
export const CF_ACCESS_ID_ENV = "CF_ACCESS_CLIENT_ID";
export const CF_ACCESS_SECRET_ENV = "CF_ACCESS_CLIENT_SECRET";

/** Header names Cloudflare Access expects for Service Token auth. */
export const CF_ACCESS_ID_HEADER = "CF-Access-Client-Id";
export const CF_ACCESS_SECRET_HEADER = "CF-Access-Client-Secret";

/**
 * Host suffix of Cloudflare Access's interactive login pages
 * (`<team>.cloudflareaccess.com`). When Access challenges a request it 302s
 * to this host — outside Capacitor's allowNavigation, so the stock
 * BridgeWebViewClient would punt it to the EXTERNAL browser, whose separate
 * cookie jar can never authenticate the app's WebView (the 2026-07-09
 * first-device-run failure). CfAccessWebViewClient.java keeps navigations to
 * this suffix in-app instead; the consistency suite pins the two literals
 * together.
 */
export const CF_ACCESS_LOGIN_HOST_SUFFIX = ".cloudflareaccess.com";

/** True when a host is a Cloudflare Access team login host — the WebView
 * must handle these itself, never hand them to the external browser. */
export function isAccessLoginHost(host: string): boolean {
  return host.endsWith(CF_ACCESS_LOGIN_HOST_SUFFIX);
}

/** Host the WebView is allowed to navigate within (Capacitor
 * allowNavigation). Throws on a non-HTTPS or malformed URL so a bad
 * override fails at sync time, not silently on the phone. */
export function appHost(url: string = APP_URL): string {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") {
    throw new Error(`LifeOS app URL must be https, got: ${url}`);
  }
  return parsed.host;
}

/**
 * Build the Service Token headers from a (client id, client secret) pair.
 * Returns BOTH headers when both values are present, and an EMPTY object
 * otherwise — a half-configured token must never send one header alone
 * (Access would reject it anyway), and the empty case is the deliberate
 * fallback: the WebView then hits Access's normal email-OTP page, which
 * still works interactively. Mirrored in CfAccess.java for the native side.
 */
export function buildCfAccessHeaders(
  clientId: string | undefined,
  clientSecret: string | undefined
): Record<string, string> {
  const id = clientId?.trim() ?? "";
  const secret = clientSecret?.trim() ?? "";
  if (!id || !secret) return {};
  return {
    [CF_ACCESS_ID_HEADER]: id,
    [CF_ACCESS_SECRET_HEADER]: secret,
  };
}

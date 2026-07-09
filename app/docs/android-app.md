# LifeOS Android app (Capacitor) — ROADMAP T18b

A native Android APK whose WebView wraps the **live** LifeOS web UI at
`https://lab.samylayaida.com` (the Cloudflare Tunnel domain — never the
tailnet IP; the phone can't resolve `.ts.net`). Nothing from the Next.js
build ships in the APK; `mobile/www/index.html` is only an offline stub.
Push notifications are unchanged: they stay on the separate ntfy Android app,
which is why this path has none of T18's Firebase/Expo blockers.

## Pieces

| Path | Role |
| --- | --- |
| `capacitor.config.ts` | appId `com.samylayaida.lifeos`, `server.url` = tunnel domain, `allowNavigation` locked to that host |
| `src/lib/mobile/cf-access.ts` | single source of truth: app URL, env-var names, header names, both-or-nothing header rule |
| `src/lib/mobile/*.test.ts` | unit tests + a consistency suite that greps the native sources so Java/gradle can't drift from the TS spec |
| `android/` | generated Capacitor project (committed). Hand-edited: `app/build.gradle`, `MainActivity.java`, new `CfAccess.java` + `CfAccessWebViewClient.java` |
| `mobile/www/` | offline fallback stub (webDir) |
| `.github/workflows/android-build.yml` | CI build of the debug APK |

## Auth: Cloudflare Access Service Token

LifeOS has no app-level auth; the only gate is Cloudflare Access in front of
the tunnel. The app bypasses the interactive email-OTP login with a scoped
**Access Service Token** sent as `CF-Access-Client-Id` /
`CF-Access-Client-Secret` headers:

1. `android/app/build.gradle` reads `CF_ACCESS_CLIENT_ID` and
   `CF_ACCESS_CLIENT_SECRET` **from the environment at APK build time**
   (empty-string fallback — the build never requires them) into BuildConfig.
2. `MainActivity.java` installs `CfAccessWebViewClient` (see below) and then
   re-issues the initial WebView load with the headers from
   `CfAccess.headers()`. Access answers an authenticated request with a
   `CF_Authorization` cookie, which the WebView's CookieManager persists
   (flushed explicitly in `onPause`) — subsequent XHR/navigation requests
   ride the cookie.
3. If either value is missing (both-or-nothing rule), no headers are sent and
   the WebView shows the normal Access email-OTP page **inside the app** —
   the app still works, just interactively.

### CfAccessWebViewClient — why a custom WebViewClient is required

Learned on the first real device run (2026-07-09, Pixel 9 / GrapheneOS):

- Capacitor's Bridge starts loading `server.url` **without** the headers
  before `MainActivity.onCreate` can re-issue the load — and WebView's
  `loadUrl(url, headers)` only attaches headers to that single request,
  never to redirects it triggers.
- When Access challenges, it 302s to `<team>.cloudflareaccess.com`. That
  host is outside `allowNavigation`, so Capacitor's stock
  `BridgeWebViewClient` → `Bridge.launchIntent()` punts it to the
  **external browser** via `ACTION_VIEW`. Observed symptom: the app
  backgrounds itself ~0.5 s after launch and the OTP page opens in the
  browser. Worse, the browser's cookie jar is separate from the WebView's,
  so completing the OTP there can never authenticate the app — returning to
  it shows a blank page.

`CfAccessWebViewClient` (extends `BridgeWebViewClient`) fixes both in
`shouldOverrideUrlLoading`: a navigation to `*.cloudflareaccess.com` with a
token baked in re-issues `server.url` with the headers (bounded retries —
also the recovery path when the cookie later expires); with no token, or
once retries are spent, the Access login page loads **in the WebView**, so
the interactive fallback sets `CF_Authorization` in the app's own cookie
jar. Everything else falls through to stock Capacitor behavior. All
decisions log under the `CfAccess` tag (never the token values), so
`adb logcat -s CfAccess` shows exactly what the auth path did.

### Server-side state (the actual blocker found 2026-07-09)

The token pair in `~/.config/homelab/secrets.env` on quorky is currently
**rejected by Access** — verified from quorky with curl: a request to
`https://lab.samylayaida.com` carrying both headers still gets a 302 to the
login page, and the `meta` JWT in that redirect says
`"service_token_status": false, "auth_status": "NONE"`. So the token exists
but is not accepted for this application. NEEDS-SAMY (dashboard-only — no
Cloudflare API credentials exist on the homelab): in Cloudflare Zero Trust →
Access → Applications → the `lab.samylayaida.com` app, add a policy with
**action "Service Auth"** (a plain Allow policy does not accept service
tokens) whose include rule is that Service Token. No APK rebuild is needed
afterwards — the token is already baked in; the same APK starts passing once
the policy accepts it. Re-verify from quorky with:

```sh
source ~/.config/homelab/secrets.env
curl -s -o /dev/null -w '%{http_code}\n' \
  -H "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" \
  -H "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET" \
  https://lab.samylayaida.com   # 200 = accepted, 302 = still rejected
```

The real token values exist nowhere in this repo, ever.

## CI build

`.github/workflows/android-build.yml` runs on pushes to `feat/android-app`
(and manually via `workflow_dispatch`): `npm ci` → `npm run test` →
`npx -y @capacitor/cli@8.4.1 sync android` → `gradlew assembleDebug` (JDK 21,
Android SDK preinstalled on `ubuntu-latest`) → uploads
`lifeos-debug-apk` as an artifact.

**CI intentionally builds without the token.** The repo is public and
artifacts on public repos are downloadable by anyone logged into GitHub — an
APK with the token baked in must never come out of this workflow. The CI
artifact is the OTP-fallback APK: safe to publish, still proves the build,
still usable.

The Capacitor CLI is pinned via `npx`, not a package.json dependency (only
`@capacitor/core` + `@capacitor/android` were approved).

## Building the authenticated APK + sideloading

On any trusted machine with JDK 21 + Android SDK (not quorky — no toolchain,
disk full):

```sh
cd app
npm ci
npx -y @capacitor/cli@8.4.1 sync android
export CF_ACCESS_CLIENT_ID='<client id>.access'      # from Cloudflare Zero Trust
export CF_ACCESS_CLIENT_SECRET='<client secret>'     # never commit these
cd android && ./gradlew assembleDebug
```

APK lands at `android/app/build/outputs/apk/debug/app-debug.apk`. Sideload:
copy it to the phone (or `adb install app-debug.apk`), allow
install-unknown-apps for the file manager on GrapheneOS, open it. First
launch should go straight to LifeOS with no OTP prompt; if the OTP page
appears, the token isn't in the Access policy or wasn't baked in.

~~Untested assumption to verify on first real run~~ — **resolved 2026-07-09**
(the first real run failed exactly here). What was actually found: the risk
was not the cookie mechanics but (a) the token being rejected server-side
(no Service Auth policy on the Access app — see "Server-side state" above)
and (b) Capacitor punting the resulting Access-login redirect to the
external browser (see "CfAccessWebViewClient"). Both client-side failure
modes are fixed by `CfAccessWebViewClient`; the cookie-on-authenticated-load
behavior itself still gets its first true exercise once the Service Auth
policy exists — the retry-with-headers path in the client covers the case
where Access needs more than one header-carrying request. Debugging aids:
`adb logcat -s CfAccess Capacitor` for the auth decisions, and Chrome DevTools
remote inspection (`chrome://inspect`, debug builds are debuggable) for the
WebView's real network/cookie state.

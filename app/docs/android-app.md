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
| `android/` | generated Capacitor project (committed). Hand-edited: `app/build.gradle`, `MainActivity.java`, new `CfAccess.java` |
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
2. `MainActivity.java` re-issues the initial WebView load with the headers
   from `CfAccess.headers()`. Access answers an authenticated request with a
   `CF_Authorization` cookie, which the WebView's CookieManager persists —
   subsequent XHR/navigation requests ride the cookie.
3. If either value is missing (both-or-nothing rule), no headers are sent and
   the WebView shows the normal Access email-OTP page — the app still works,
   just interactively.

The real token values exist nowhere in this repo, ever. As of 2026-07-09
Samy has not yet created the token (NEEDS-SAMY in ROADMAP T18b): create it in
Cloudflare Zero Trust → Access → Service Auth, include it in the Access
policy for `lab.samylayaida.com`, then supply the two values as env vars
where the APK is built.

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

Untested assumption to verify on first real run: that Access sets the
`CF_Authorization` cookie on the header-authenticated document load so
follow-up XHRs pass. If it doesn't, the fallback is intercepting requests in
a custom `BridgeWebViewClient` — noted in ROADMAP T18b.

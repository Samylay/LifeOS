// Cross-language drift guard for the Capacitor Android wrapper (T18b).
// The auth logic lives twice — TypeScript spec (cf-access.ts) and the native
// Java that actually runs (CfAccess.java) — and the secret plumbing lives in
// build.gradle. Nothing compiles across that boundary, so these tests read
// the native sources as text and assert the load-bearing strings stay in
// sync, and that no credential-shaped literal ever lands in the repo.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  APP_URL,
  CF_ACCESS_ID_ENV,
  CF_ACCESS_SECRET_ENV,
  CF_ACCESS_ID_HEADER,
  CF_ACCESS_SECRET_HEADER,
  CF_ACCESS_LOGIN_HOST_SUFFIX,
  SIBLING_IN_APP_HOSTS,
  inAppHosts,
} from "./cf-access";

const appRoot = path.resolve(__dirname, "../../..");
const read = (rel: string) => fs.readFileSync(path.join(appRoot, rel), "utf8");

const cfAccessJava = read("android/app/src/main/java/com/samylayaida/lifeos/CfAccess.java");
const mainActivityJava = read(
  "android/app/src/main/java/com/samylayaida/lifeos/MainActivity.java"
);
const webViewClientJava = read(
  "android/app/src/main/java/com/samylayaida/lifeos/CfAccessWebViewClient.java"
);
const buildGradle = read("android/app/build.gradle");

describe("CfAccess.java mirrors cf-access.ts", () => {
  it("uses the same Cloudflare Access header names", () => {
    expect(cfAccessJava).toContain(`"${CF_ACCESS_ID_HEADER}"`);
    expect(cfAccessJava).toContain(`"${CF_ACCESS_SECRET_HEADER}"`);
  });

  it("reads the token from BuildConfig fields, not literals", () => {
    expect(cfAccessJava).toContain(`BuildConfig.${CF_ACCESS_ID_ENV}`);
    expect(cfAccessJava).toContain(`BuildConfig.${CF_ACCESS_SECRET_ENV}`);
  });

  it("keeps the both-or-nothing rule (empty map when either half is missing)", () => {
    expect(cfAccessJava).toMatch(/id\.isEmpty\(\)\s*\|\|\s*secret\.isEmpty\(\)/);
  });
});

describe("build.gradle secret plumbing", () => {
  it("reads both env vars with an empty-string fallback (build never needs the real token)", () => {
    expect(buildGradle).toContain(`System.getenv("${CF_ACCESS_ID_ENV}") ?: ""`);
    expect(buildGradle).toContain(`System.getenv("${CF_ACCESS_SECRET_ENV}") ?: ""`);
  });

  it("injects both BuildConfig fields from the env vars, never from literals", () => {
    expect(buildGradle).toContain(
      `buildConfigField "String", "${CF_ACCESS_ID_ENV}", "\\"\${cfAccessClientId}\\""`
    );
    expect(buildGradle).toContain(
      `buildConfigField "String", "${CF_ACCESS_SECRET_ENV}", "\\"\${cfAccessClientSecret}\\""`
    );
    expect(buildGradle).toMatch(/buildConfig true/);
  });

  it("contains no credential-shaped literal (Access client ids end in .access)", () => {
    for (const source of [cfAccessJava, mainActivityJava, webViewClientJava]) {
      expect(source).not.toMatch(/[0-9a-f]{16,}/i);
    }
    for (const source of [buildGradle, cfAccessJava, mainActivityJava, webViewClientJava]) {
      expect(source).not.toMatch(/\w+\.access["']/);
    }
  });
});

describe("MainActivity.java", () => {
  it("re-issues the initial load with the token headers via the Bridge", () => {
    expect(mainActivityJava).toContain("CfAccess.headers()");
    expect(mainActivityJava).toContain("getServerUrl()");
    expect(mainActivityJava).toMatch(/loadUrl\(serverUrl,\s*headers\)/);
  });

  it("installs CfAccessWebViewClient BEFORE re-issuing the load (external-browser race)", () => {
    const install = mainActivityJava.indexOf("setWebViewClient(new CfAccessWebViewClient(");
    const reissue = mainActivityJava.indexOf("loadUrl(serverUrl, headers)");
    expect(install).toBeGreaterThan(-1);
    expect(reissue).toBeGreaterThan(-1);
    expect(install).toBeLessThan(reissue);
  });

  it("flushes the cookie store on pause so CF_Authorization survives process death", () => {
    expect(mainActivityJava).toMatch(/onPause\(\)[\s\S]*CookieManager\.getInstance\(\)\.flush\(\)/);
  });

  it("mirrors SIBLING_IN_APP_HOSTS from cf-access.ts (T48)", () => {
    for (const host of SIBLING_IN_APP_HOSTS) {
      expect(mainActivityJava).toContain(`"${host}"`);
    }
  });

  it("registers a BACK callback that returns sibling in-app hosts to the LifeOS server URL", () => {
    expect(mainActivityJava).toContain("OnBackPressedCallback");
    expect(mainActivityJava).toContain("isSiblingInAppHost(host)");
    expect(mainActivityJava).toMatch(/isSiblingInAppHost\(host\)\)\s*\{[\s\S]{0,200}webView\.loadUrl\(serverUrl\);/);
  });

  it("falls through to stock BACK behavior on the LifeOS host itself", () => {
    expect(mainActivityJava).toMatch(/setEnabled\(false\)[\s\S]{0,80}getOnBackPressedDispatcher\(\)\.onBackPressed\(\)/);
  });
});

describe("CfAccessWebViewClient.java (keeps the Access flow in-app)", () => {
  it("extends Capacitor's BridgeWebViewClient (stock behavior for everything else)", () => {
    expect(webViewClientJava).toMatch(/class CfAccessWebViewClient extends BridgeWebViewClient/);
    expect(webViewClientJava).toContain("super.shouldOverrideUrlLoading(view, request)");
  });

  it("uses the same Access login host suffix as the TS spec", () => {
    expect(webViewClientJava).toContain(`"${CF_ACCESS_LOGIN_HOST_SUFFIX}"`);
    // Suffix match must be host-boundary safe: a leading dot in the literal.
    expect(CF_ACCESS_LOGIN_HOST_SUFFIX.startsWith(".")).toBe(true);
    expect(webViewClientJava).toMatch(/host\.endsWith\(ACCESS_LOGIN_HOST_SUFFIX\)/);
  });

  it("re-issues the load with the token headers a BOUNDED number of times", () => {
    expect(webViewClientJava).toContain("CfAccess.headers()");
    expect(webViewClientJava).toMatch(/headerRetriesLeft > 0/);
    expect(webViewClientJava).toMatch(/headerRetriesLeft--/);
  });

  it("falls back to showing the Access login IN the WebView, never the external browser", () => {
    // The login-host branch must end in `return false` (WebView handles it),
    // never fall through to Bridge.launchIntent's ACTION_VIEW punt.
    expect(webViewClientJava).toMatch(
      /Keeping Access interactive login in-app[\s\S]{0,120}return false;/
    );
  });

  it("never logs the token values", () => {
    // Log lines may mention the URL and retry count, never the header map
    // contents or BuildConfig fields.
    for (const source of [webViewClientJava, mainActivityJava]) {
      const logLines = source.match(/Log\.\w+\([\s\S]*?\);/g) ?? [];
      expect(logLines.length).toBeGreaterThan(0);
      for (const line of logLines) {
        // Never concatenate the header map or a BuildConfig field into a log.
        expect(line).not.toMatch(/\+\s*headers\b/);
        expect(line).not.toMatch(/headers\.(get|toString|values|entrySet)/);
        expect(line).not.toContain("BuildConfig");
      }
    }
  });
});

// The assets-dir config is GENERATED by `npx cap sync android` and gitignored
// by the Capacitor template, so it only exists after a sync. CI syncs before
// running tests (android-build.yml), so this suite always runs there; on a
// fresh checkout that never synced there is nothing to check yet.
const generatedConfigPath = path.join(
  appRoot,
  "android/app/src/main/assets/capacitor.config.json"
);

describe.skipIf(!fs.existsSync(generatedConfigPath))(
  "generated Capacitor config (android assets)",
  () => {
    // Lazy: a skipped describe still executes its body at collection time.
    const loadGenerated = () => JSON.parse(fs.readFileSync(generatedConfigPath, "utf8"));

    it("points the WebView at the tunnel domain from cf-access.ts", () => {
      const generated = loadGenerated();
      expect(generated.server.url).toBe(APP_URL);
      expect(generated.server.allowNavigation).toEqual(inAppHosts());
    });

    it("keeps the LifeOS app identity", () => {
      const generated = loadGenerated();
      expect(generated.appId).toBe("com.samylayaida.lifeos");
      expect(generated.appName).toBe("LifeOS");
    });
  }
);

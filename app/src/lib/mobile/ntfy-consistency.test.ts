// Cross-language drift guard for the native ntfy push piece (T17b routing).
// The subscription/rendering logic lives twice — TypeScript spec (ntfy.ts)
// and the Java that actually runs (NtfyService.java) — plus manifest wiring.
// Same pattern as android-consistency.test.ts: read the native sources as
// text and pin the load-bearing strings together.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  NTFY_BASE_URL,
  NTFY_TOPIC,
  PAGER_PATH,
  OPEN_PATH_EXTRA,
  CHANNEL_SERVICE,
  CHANNEL_URGENT,
  CHANNEL_DEFAULT,
  CHANNEL_LOW,
  channelForPriority,
  pathFromClick,
} from "./ntfy";
import { APP_URL } from "./cf-access";

const appRoot = path.resolve(__dirname, "../../..");
const read = (rel: string) => fs.readFileSync(path.join(appRoot, rel), "utf8");

const serviceJava = read("android/app/src/main/java/com/samylayaida/lifeos/NtfyService.java");
const bootReceiverJava = read(
  "android/app/src/main/java/com/samylayaida/lifeos/NtfyBootReceiver.java"
);
const mainActivityJava = read(
  "android/app/src/main/java/com/samylayaida/lifeos/MainActivity.java"
);
const manifest = read("android/app/src/main/AndroidManifest.xml");
const netSecurityConfig = read("android/app/src/main/res/xml/network_security_config.xml");

describe("NtfyService.java mirrors ntfy.ts", () => {
  it("subscribes to the same self-hosted instance and topic", () => {
    expect(serviceJava).toContain(`"${NTFY_BASE_URL}"`);
    expect(serviceJava).toContain(`"${NTFY_TOPIC}"`);
    expect(serviceJava).toMatch(/NTFY_BASE_URL \+ "\/" \+ NTFY_TOPIC \+ "\/json"/);
  });

  it("resumes from the last rendered message id (since=)", () => {
    expect(serviceJava).toMatch(/\?since=/);
    expect(serviceJava).toContain("last_message_id");
  });

  it("only renders message events with an id and a body (parseNtfyEvent rule)", () => {
    expect(serviceJava).toMatch(/"message"\.equals\(event\.optString\("event"\)\)/);
    expect(serviceJava).toMatch(/id\.isEmpty\(\) \|\| message\.isEmpty\(\)/);
  });

  it("uses the same channel ids", () => {
    for (const channel of [CHANNEL_SERVICE, CHANNEL_URGENT, CHANNEL_DEFAULT, CHANNEL_LOW]) {
      expect(serviceJava).toContain(`"${channel}"`);
    }
  });

  it("maps priorities with the same thresholds as channelForPriority()", () => {
    // TS spec: 4-5 urgent, 1-2 low, else default — Java must use the same cuts.
    expect(channelForPriority(4)).toBe(CHANNEL_URGENT);
    expect(channelForPriority(2)).toBe(CHANNEL_LOW);
    expect(serviceJava).toMatch(/priority >= 4[\s\S]{0,80}CHANNEL_URGENT/);
    expect(serviceJava).toMatch(/priority <= 2[\s\S]{0,80}CHANNEL_LOW/);
    expect(serviceJava).toMatch(/optInt\("priority", 3\)/);
  });

  it("taps open the pager path via the shared intent extra", () => {
    expect(serviceJava).toContain(`"${PAGER_PATH}"`);
    expect(serviceJava).toContain(`"${OPEN_PATH_EXTRA}"`);
  });

  it("deep-links via the message's click URL with the same rules as pathFromClick()", () => {
    // Java reads the click field and derives the path from it.
    expect(serviceJava).toMatch(/optString\("click", ""\)/);
    expect(serviceJava).toMatch(/pathFromClick\(/);
    // Same origin pin as clickUrlForPath() (constant duplicated on purpose —
    // NtfyService must never reference CfAccess).
    expect(serviceJava).toContain(`"${APP_URL}"`);
    // Same fallback + guards as the TS spec.
    expect(serviceJava).toMatch(/startsWith\("\/\/"\) \? PAGER_PATH/);
    expect(serviceJava).toMatch(/CLICK_URL_BASE \+ "\/"/);
    expect(pathFromClick(`${APP_URL}/prime`)).toBe("/prime");
    // Distinct notifications must keep distinct tap targets: the PendingIntent
    // request code varies per message (extras don't count for Intent equality).
    expect(serviceJava).toMatch(/openPathIntent\(id\.hashCode\(\), pathFromClick\(click\)\)/);
  });

  it("uses the LifeOS mark as the notification icon (branding, not ntfy's)", () => {
    expect(serviceJava).toMatch(/setSmallIcon\(R\.drawable\.splash_mark\)/);
  });

  it("reconnects with bounded exponential backoff instead of hot-looping", () => {
    expect(serviceJava).toMatch(/BACKOFF_MIN_MS/);
    expect(serviceJava).toMatch(/Math\.min\(backoffMs \* 2, BACKOFF_MAX_MS\)/);
  });

  it("talks to ntfy directly — never with Cloudflare Access headers", () => {
    expect(serviceJava).not.toContain("CfAccess");
  });
});

describe("AndroidManifest wiring", () => {
  it("declares the service as a specialUse foreground service with the subtype property", () => {
    expect(manifest).toMatch(/android:name="\.NtfyService"[\s\S]{0,200}foregroundServiceType="specialUse"/);
    expect(manifest).toContain("android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE");
  });

  it("declares every permission the push path needs", () => {
    for (const permission of [
      "android.permission.POST_NOTIFICATIONS",
      "android.permission.FOREGROUND_SERVICE",
      "android.permission.FOREGROUND_SERVICE_SPECIAL_USE",
      "android.permission.RECEIVE_BOOT_COMPLETED",
    ]) {
      expect(manifest).toContain(`<uses-permission android:name="${permission}" />`);
    }
  });

  it("restarts the subscription on boot via a non-exported receiver", () => {
    expect(manifest).toMatch(/android:name="\.NtfyBootReceiver"[\s\S]{0,120}android:exported="false"/);
    expect(manifest).toContain("android.intent.action.BOOT_COMPLETED");
    expect(bootReceiverJava).toContain("ACTION_BOOT_COMPLETED");
    expect(bootReceiverJava).toContain("NtfyService.start(context)");
  });

  it("permits cleartext ONLY for the ntfy tailnet host; base config stays HTTPS-only", () => {
    expect(manifest).toContain('android:networkSecurityConfig="@xml/network_security_config"');
    expect(netSecurityConfig).toContain('<base-config cleartextTrafficPermitted="false" />');
    const ntfyHost = new URL(NTFY_BASE_URL).hostname;
    expect(netSecurityConfig).toContain(`<domain includeSubdomains="false">${ntfyHost}</domain>`);
    // Exactly one cleartext exemption — nothing else may go plain HTTP.
    expect(netSecurityConfig.match(/<domain[ >]/g)).toHaveLength(1);
  });
});

describe("MainActivity notification-tap handling", () => {
  it("starts the subscription service on launch", () => {
    expect(mainActivityJava).toContain("NtfyService.start(this)");
  });

  it("requests POST_NOTIFICATIONS on Android 13+", () => {
    expect(mainActivityJava).toContain("Manifest.permission.POST_NOTIFICATIONS");
  });

  it("handles the open-path extra in BOTH onCreate and onNewIntent (singleTask)", () => {
    expect(manifest).toContain('android:launchMode="singleTask"');
    expect(mainActivityJava).toMatch(/onCreate\([\s\S]*openRequestedPath\(getIntent\(\)\)/);
    expect(mainActivityJava).toMatch(/onNewIntent\(Intent intent\)[\s\S]*openRequestedPath\(intent\)/);
  });

  it("only navigates to in-app absolute paths (no arbitrary URLs from intents)", () => {
    expect(mainActivityJava).toMatch(/path\.startsWith\("\/"\)/);
    expect(mainActivityJava).toMatch(/serverUrl \+ path, CfAccess\.headers\(\)/);
  });
});

import { describe, it, expect } from "vitest";
import {
  APP_URL,
  CF_ACCESS_ID_HEADER,
  CF_ACCESS_SECRET_HEADER,
  CF_ACCESS_LOGIN_HOST_SUFFIX,
  appHost,
  buildCfAccessHeaders,
  isAccessLoginHost,
} from "./cf-access";

describe("buildCfAccessHeaders", () => {
  it("returns both headers when id and secret are present", () => {
    expect(buildCfAccessHeaders("id.access", "s3cret")).toEqual({
      [CF_ACCESS_ID_HEADER]: "id.access",
      [CF_ACCESS_SECRET_HEADER]: "s3cret",
    });
  });

  it("trims surrounding whitespace (a pasted-in secret often has it)", () => {
    expect(buildCfAccessHeaders(" id ", "\tsecret\n")).toEqual({
      [CF_ACCESS_ID_HEADER]: "id",
      [CF_ACCESS_SECRET_HEADER]: "secret",
    });
  });

  it("returns NO headers when the secret is missing — never send one alone", () => {
    expect(buildCfAccessHeaders("id", undefined)).toEqual({});
    expect(buildCfAccessHeaders("id", "")).toEqual({});
    expect(buildCfAccessHeaders("id", "   ")).toEqual({});
  });

  it("returns NO headers when the id is missing", () => {
    expect(buildCfAccessHeaders(undefined, "secret")).toEqual({});
    expect(buildCfAccessHeaders("", "secret")).toEqual({});
  });

  it("returns NO headers when both are missing (interactive-OTP fallback)", () => {
    expect(buildCfAccessHeaders(undefined, undefined)).toEqual({});
  });

  it("uses the exact header names Cloudflare Access expects", () => {
    expect(CF_ACCESS_ID_HEADER).toBe("CF-Access-Client-Id");
    expect(CF_ACCESS_SECRET_HEADER).toBe("CF-Access-Client-Secret");
  });
});

describe("appHost / APP_URL", () => {
  it("points at the Cloudflare Tunnel domain, never the tailnet IP", () => {
    expect(APP_URL).toBe("https://lab.samylayaida.com");
    expect(APP_URL).not.toMatch(/100\.\d+\.\d+\.\d+/);
  });

  it("derives the allowNavigation host from the app URL", () => {
    expect(appHost()).toBe("lab.samylayaida.com");
    expect(appHost("https://example.com:8443/path")).toBe("example.com:8443");
  });

  it("rejects non-https URLs so a bad override fails at sync time", () => {
    expect(() => appHost("http://lab.samylayaida.com")).toThrow(/https/);
    expect(() => appHost("not a url")).toThrow();
  });
});

describe("isAccessLoginHost", () => {
  it("matches any Cloudflare Access team login host", () => {
    expect(isAccessLoginHost("old-flower-092e.cloudflareaccess.com")).toBe(true);
    expect(isAccessLoginHost("anything.cloudflareaccess.com")).toBe(true);
  });

  it("does not match the app host or lookalike hosts", () => {
    expect(isAccessLoginHost(appHost())).toBe(false);
    expect(isAccessLoginHost("cloudflareaccess.com")).toBe(false);
    expect(isAccessLoginHost("evil-cloudflareaccess.com")).toBe(false);
    expect(isAccessLoginHost("cloudflareaccess.com.evil.example")).toBe(false);
  });

  it("keeps the suffix a real host-boundary suffix (leading dot)", () => {
    expect(CF_ACCESS_LOGIN_HOST_SUFFIX.startsWith(".")).toBe(true);
  });
});

import { describe, it, expect } from "vitest";
import { findExpiringConsents, isConsentExpired, buildTripwireMessage } from "./bank-consent-tripwire";
import type { BankSessionRow } from "./bank-db";

const NOW = "2026-08-17T00:00:00Z";

function session(overrides: Partial<BankSessionRow>): BankSessionRow {
  return {
    sessionId: "sess-1",
    aspspName: "REDACTED_BANK",
    aspspCountry: "FR",
    accounts: ["acct-1"],
    validUntil: null,
    createdAt: NOW,
    ...overrides,
  };
}

describe("findExpiringConsents", () => {
  it("includes a session expiring in fewer than 10 days", () => {
    const soon = session({ sessionId: "sess-soon", validUntil: "2026-08-22T00:00:00Z" }); // +5d
    const result = findExpiringConsents([soon], NOW);
    expect(result).toHaveLength(1);
    expect(result[0].session.sessionId).toBe("sess-soon");
    expect(result[0].daysRemaining).toBeCloseTo(5, 1);
  });

  it("excludes a session with plenty of runway", () => {
    const fresh = session({ sessionId: "sess-fresh", validUntil: "2027-02-01T00:00:00Z" }); // ~168d
    expect(findExpiringConsents([fresh], NOW)).toHaveLength(0);
  });

  it("excludes a session with no recorded validUntil", () => {
    const unknown = session({ sessionId: "sess-unknown", validUntil: null });
    expect(findExpiringConsents([unknown], NOW)).toHaveLength(0);
  });

  it("includes an already-expired session with a negative daysRemaining", () => {
    const expired = session({ sessionId: "sess-expired", validUntil: "2026-08-01T00:00:00Z" });
    const result = findExpiringConsents([expired], NOW);
    expect(result).toHaveLength(1);
    expect(result[0].daysRemaining).toBeLessThan(0);
  });
});

describe("isConsentExpired", () => {
  it("is false for a null validUntil", () => {
    expect(isConsentExpired(null, NOW)).toBe(false);
  });
  it("is false for a future validUntil", () => {
    expect(isConsentExpired("2026-08-22T00:00:00Z", NOW)).toBe(false);
  });
  it("is true for a past validUntil", () => {
    expect(isConsentExpired("2026-08-01T00:00:00Z", NOW)).toBe(true);
  });
});

describe("buildTripwireMessage", () => {
  it("names the bank and deep-links to /finance", () => {
    const msg = buildTripwireMessage({
      session: session({ aspspName: "REDACTED_BANK", validUntil: "2026-08-22T00:00:00Z" }),
      daysRemaining: 5,
    });
    expect(msg.text).toContain("REDACTED_BANK");
    expect(msg.text).toContain("expires in 5 days");
    expect(msg.path).toBe("/finance");
  });
});

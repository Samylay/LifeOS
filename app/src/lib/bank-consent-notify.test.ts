import { describe, it, expect, vi, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import type { BankSessionRow } from "./bank-db";

// getBankSyncState/setBankSyncState (used for the once-per-day dedupe) go
// through getBankDb(), which lazily opens the file on first use — must be
// set before any query runs, same pattern as bank-db.test.ts.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lifeos-consent-notify-test-"));
process.env.LIFEOS_DB_PATH = path.join(tmpDir, "test.db");

const { checkAndNotifyConsentExpiry } = await import("./bank-consent-notify");

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

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

describe("checkAndNotifyConsentExpiry", () => {
  it("fires the pager for a session expiring in under 10 days", async () => {
    const transport = vi.fn(async () => new Response("{}", { status: 200 }));
    const soon = session({ sessionId: "sess-page-soon", validUntil: "2026-08-22T00:00:00Z" });
    const result = await checkAndNotifyConsentExpiry([soon], transport as unknown as typeof fetch, NOW);
    expect(result).toHaveLength(1);
    expect(transport).toHaveBeenCalledTimes(1);
    const [url, init] = transport.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://127.0.0.1:3000/api/notify");
    const body = JSON.parse(init.body as string);
    expect(body.path).toBe("/finance");
    expect(body.severity).toBe("high");
  });

  it("does not fire the pager for a session with plenty of runway", async () => {
    const transport = vi.fn(async () => new Response("{}", { status: 200 }));
    const fresh = session({ sessionId: "sess-page-fresh", validUntil: "2027-02-01T00:00:00Z" });
    const result = await checkAndNotifyConsentExpiry([fresh], transport as unknown as typeof fetch, NOW);
    expect(result).toHaveLength(0);
    expect(transport).not.toHaveBeenCalled();
  });

  it("does not re-page the same session twice on the same calendar day", async () => {
    const transport = vi.fn(async () => new Response("{}", { status: 200 }));
    const soon = session({ sessionId: "sess-dedupe", validUntil: "2026-08-22T00:00:00Z" });
    await checkAndNotifyConsentExpiry([soon], transport as unknown as typeof fetch, NOW);
    await checkAndNotifyConsentExpiry([soon], transport as unknown as typeof fetch, "2026-08-17T12:00:00Z");
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("never throws when the pager call itself fails", async () => {
    const transport = vi.fn(async () => {
      throw new Error("pager down");
    });
    const soon = session({ sessionId: "sess-pager-down", validUntil: "2026-08-22T00:00:00Z" });
    await expect(
      checkAndNotifyConsentExpiry([soon], transport as unknown as typeof fetch, NOW)
    ).resolves.toHaveLength(1);
  });
});

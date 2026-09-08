import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BANK_SYNC_INTERVAL_MS, nextBankSyncAt } from "./bank-sync-schedule";

const state = vi.hoisted(() => ({ attempt: "", success: "", configured: true, accounts: [{ accountUid: "fixture" }] }));
vi.mock("./bank-db", () => ({ getBankSyncState: (key: string) => key === "last_sync_attempt_at" ? state.attempt : state.success, listBankAccounts: () => state.accounts }));
vi.mock("./enable-banking", () => ({ isEnableBankingConfigured: () => state.configured }));
vi.mock("./bank-sync", () => ({ requestBankSync: vi.fn(async () => { state.attempt = String(Date.now()); }) }));
import { requestBankSync } from "./bank-sync";
import { startBankSyncScheduler, syncBankIfDue } from "./bank-sync-scheduler";

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-09T10:00:00Z")); state.attempt = ""; state.success = ""; state.configured = true; state.accounts = [{ accountUid: "fixture" }]; vi.clearAllMocks(); globalThis.__bankSyncSchedulerStarted = false; });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); globalThis.__bankSyncSchedulerStarted = false; });

describe("five-hour bank schedule", () => {
  it("catches up after boot once and does not duplicate scheduler registration", async () => {
    startBankSyncScheduler(); startBankSyncScheduler();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(requestBankSync).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(BANK_SYNC_INTERVAL_MS - 60_000);
    expect(requestBankSync).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(requestBankSync).toHaveBeenCalledTimes(2);
  });
  it("respects a persisted manual attempt or success across restart", async () => {
    state.success = String(Date.now() - 3_600_000);
    await syncBankIfDue(); expect(requestBankSync).not.toHaveBeenCalled();
    state.attempt = String(Date.now());
    state.success = "";
    await syncBankIfDue(); expect(requestBankSync).not.toHaveBeenCalled();
  });
  it("does not request a bank without configuration or linked accounts", async () => {
    state.configured = false; await syncBankIfDue();
    state.configured = true; state.accounts = []; await syncBankIfDue();
    expect(requestBankSync).not.toHaveBeenCalled();
  });
  it("invalid and future timestamps cannot block catch-up indefinitely", () => {
    const now = Date.now();
    expect(nextBankSyncAt(NaN, now + 1000, now)).toBe(now);
    expect(nextBankSyncAt(now - 1000, null, now)).toBe(now - 1000 + BANK_SYNC_INTERVAL_MS);
  });
});

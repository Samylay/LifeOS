import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => new Map<string, string>());
vi.mock("./bank-db", () => ({ listBankAccounts: () => [{ accountUid: "a" }, { accountUid: "b" }], listBankSessions: () => [], upsertBankTransactions: (rows: unknown[]) => rows.length, countBankTransactions: () => 2, setBankSyncState: (key: string, value: string) => store.set(key, value), saveAccountBalance: vi.fn() }));
vi.mock("./enable-banking", () => ({ isEnableBankingConfigured: () => true, getTransactions: vi.fn(), getBalances: vi.fn(async () => []) }));
vi.mock("./bank-consent-notify", () => ({ checkAndNotifyConsentExpiry: vi.fn() }));
import { getTransactions } from "./enable-banking";
import { requestBankSync, syncBankTransactions } from "./bank-sync";

beforeEach(() => { vi.clearAllMocks(); store.clear(); globalThis.__bankSyncFlight = undefined; });
describe("honest bank sync state", () => {
  it("keeps the last successful timestamp when one account fails", async () => {
    store.set("last_sync_at", "123");
    vi.mocked(getTransactions).mockImplementation(async (uid) => uid === "a" ? null : { transactions: [] });
    const result = await syncBankTransactions();
    expect(result.ok).toBe(false); expect(result.accounts).toHaveLength(2);
    expect(result.reason).toContain("1 of 2"); expect(store.get("last_sync_at")).toBe("123");
    expect(store.get("last_sync_attempt_at")).toBeTruthy();
  });
  it("marks bounded pagination as incomplete rather than fresh", async () => {
    vi.mocked(getTransactions).mockResolvedValue({ transactions: [], continuationKey: "more" });
    expect((await syncBankTransactions()).ok).toBe(false);
    expect(getTransactions).toHaveBeenCalledTimes(40);
    expect(store.has("last_sync_at")).toBe(false);
  });
  it("shares the same in-flight request between manual and scheduled refresh", async () => {
    vi.mocked(getTransactions).mockResolvedValue({ transactions: [] });
    const first = requestBankSync(); const second = requestBankSync();
    expect(first).toBe(second);
    expect((await first).ok).toBe(true);
    expect(getTransactions).toHaveBeenCalledTimes(2);
    expect(globalThis.__bankSyncFlight).toBeUndefined();
    expect(store.get("last_sync_error")).toBe("");
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// The regression this file guards: the Garmin session used to live only in a
// module-level Map, so every container restart logged Samy out and demanded
// his email + password again. Tokens now persist under <dataDir>/garmin/.

const loginSpy = vi.fn();
const loadTokenByFileSpy = vi.fn();
let exportedToken: { oauth2: { expires_at: number } } = {
  oauth2: { expires_at: 4_000_000_000 },
};

// Mirrors garmin-connect's real exportTokenToFile, whose mkdir is NOT
// recursive. A spy that just recorded the call let the first-login crash
// (`ENOENT ... mkdir '/data/garmin/local'`) reach Samy's screen, so the mock
// reproduces the library's actual filesystem behaviour instead.
const exportTokenToFileSpy = vi.fn((dirPath: string) => {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath); // non-recursive, on purpose
  fs.writeFileSync(
    path.join(dirPath, "oauth1_token.json"),
    JSON.stringify({ oauth_token: "t" })
  );
  fs.writeFileSync(
    path.join(dirPath, "oauth2_token.json"),
    JSON.stringify({ access_token: "a", ...exportedToken.oauth2 })
  );
});

vi.mock("garmin-connect", () => ({
  GarminConnect: class {
    credentials: { username: string; password: string };
    constructor(credentials: { username: string; password: string }) {
      this.credentials = credentials;
    }
    login = loginSpy;
    getUserProfile = async () => ({
      fullName: "Samy L",
      displayName: "profile-hash-123",
    });
    loadTokenByFile = loadTokenByFileSpy;
    exportTokenToFile = exportTokenToFileSpy;
    exportToken = () => exportedToken;
    get = async () => ({
      calendarDate: "2026-08-15",
      totalKilocalories: 2680,
      activeKilocalories: 420,
      bmrKilocalories: 1885,
      consumedKilocalories: 2210,
    });
    getDailyWeightData = async () => ({ totalAverage: { weight: 83_400 } });
  },
}));

let tmpDir: string;

/** Fresh module instance so the in-memory Map never leaks between tests. */
async function loadService() {
  vi.resetModules();
  return import("./garmin-service");
}

function writeTokenFiles(userId = "local") {
  const dir = path.join(tmpDir, "garmin", encodeURIComponent(userId));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "oauth1_token.json"),
    JSON.stringify({ oauth_token: "t", oauth_token_secret: "s" })
  );
  fs.writeFileSync(
    path.join(dir, "oauth2_token.json"),
    JSON.stringify({ access_token: "a", expires_at: 4_000_000_000 })
  );
  fs.writeFileSync(
    path.join(dir, "session.json"),
    JSON.stringify({
      username: "samy@example.com",
      displayName: "Samy L",
      profileId: "profile-hash-123",
    })
  );
  return dir;
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lifeos-garmin-"));
  process.env.LIFEOS_DB_PATH = path.join(tmpDir, "lifeos.db");
  loginSpy.mockReset();
  loadTokenByFileSpy.mockReset();
  exportTokenToFileSpy.mockReset();
  exportedToken = { oauth2: { expires_at: 4_000_000_000 } };
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.LIFEOS_DB_PATH;
});

describe("garmin session persistence", () => {
  it("reports disconnected when nothing has been persisted", async () => {
    const svc = await loadService();
    expect(svc.getGarminStatus("local")).toEqual({
      connected: false,
      displayName: null,
    });
  });

  // Regression: the data volume starts with no `garmin/` directory at all, so
  // the very first login has to create two levels, not one.
  it("creates the token directory chain on a first-ever login", async () => {
    const svc = await loadService();
    expect(fs.existsSync(path.join(tmpDir, "garmin"))).toBe(false);

    const result = await svc.connectGarmin("local", "samy@example.com", "pw");

    expect(result.error).toBeUndefined();
    expect(result.success).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, "garmin", "local"))).toBe(true);
  });

  it("writes tokens and a session file on a successful connect", async () => {
    const svc = await loadService();
    const result = await svc.connectGarmin("local", "samy@example.com", "pw");

    expect(result.success).toBe(true);
    expect(exportTokenToFileSpy).toHaveBeenCalledOnce();

    const session = JSON.parse(
      fs.readFileSync(
        path.join(tmpDir, "garmin", "local", "session.json"),
        "utf8"
      )
    );
    expect(session).toEqual({
      username: "samy@example.com",
      displayName: "Samy L",
      profileId: "profile-hash-123",
    });
  });

  it("never writes the password to disk", async () => {
    const svc = await loadService();
    await svc.connectGarmin("local", "samy@example.com", "hunter2");

    const written = fs
      .readdirSync(path.join(tmpDir, "garmin", "local"))
      .map((f) =>
        fs.readFileSync(path.join(tmpDir, "garmin", "local", f), "utf8")
      )
      .join("");
    expect(written).not.toContain("hunter2");
  });

  it("restores a session from disk in a fresh process, without logging in", async () => {
    writeTokenFiles();
    const svc = await loadService(); // fresh module = empty in-memory Map

    expect(svc.getGarminStatus("local")).toEqual({
      connected: true,
      displayName: "Samy L",
    });
    expect(loadTokenByFileSpy).toHaveBeenCalledOnce();
    expect(loginSpy).not.toHaveBeenCalled();
  });

  it("serves data after a restart without a fresh login", async () => {
    writeTokenFiles();
    const svc = await loadService();

    const weighIn = await svc.fetchWeight("local", new Date("2026-08-15"));
    expect(weighIn).toEqual({ calendarDate: "2026-08-15", weightKg: 83.4 });
    expect(loginSpy).not.toHaveBeenCalled();
  });

  it("re-exports the token when the library refreshed it mid-request", async () => {
    writeTokenFiles();
    const svc = await loadService();
    exportedToken = { oauth2: { expires_at: 4_000_009_999 } }; // refreshed

    await svc.fetchWeight("local", new Date("2026-08-15"));
    expect(exportTokenToFileSpy).toHaveBeenCalledOnce();
  });

  it("does not rewrite the token when the expiry is unchanged", async () => {
    writeTokenFiles();
    const svc = await loadService();

    await svc.fetchWeight("local", new Date("2026-08-15"));
    expect(exportTokenToFileSpy).not.toHaveBeenCalled();
  });

  it("clears the persisted tokens on disconnect", async () => {
    writeTokenFiles();
    const svc = await loadService();
    expect(svc.getGarminStatus("local").connected).toBe(true);

    svc.disconnectGarmin("local");
    expect(fs.existsSync(path.join(tmpDir, "garmin", "local"))).toBe(false);
    expect(svc.getGarminStatus("local").connected).toBe(false);
  });
});

describe("nutrition from MyFitnessPal via Garmin", () => {
  it("maps the daily summary and computes the net", async () => {
    writeTokenFiles();
    const svc = await loadService();

    const n = await svc.fetchDailyNutrition("local", new Date("2026-08-15"));
    expect(n).toEqual({
      calendarDate: "2026-08-15",
      consumedKcal: 2210,
      burnedKcal: 2680,
      activeKcal: 420,
      bmrKcal: 1885,
      netKcal: -470,
      loggedInMfp: true,
    });
  });

  // The route turns this into a 401 so the UI can prompt a reconnect, rather
  // than rendering a silent zero that would read as "ate nothing today".
  it("throws when Garmin is not connected", async () => {
    const svc = await loadService();
    await expect(
      svc.fetchDailyNutrition("local", new Date("2026-08-15"))
    ).rejects.toThrow("Not connected to Garmin");
  });
});

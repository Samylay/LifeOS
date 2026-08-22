import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

// getDb() lazily opens the file on first use and caches env in a module-level
// singleton, so LIFEOS_DB_PATH must be set before any query runs — never
// point this at the real data/lifeos.db.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lifeos-dev-requests-test-"));
process.env.LIFEOS_DB_PATH = path.join(tmpDir, "test.db");

const {
  validateDevRequestInput,
  addDevRequest,
  listDevRequests,
  listQueuedDevRequests,
  completeDevRequest,
} = await import("./dev-requests");

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("validateDevRequestInput", () => {
  it("accepts a valid input with optional project", () => {
    expect(
      validateDevRequestInput({ project: "lifeos", title: "Fix X", description: "Do Y" })
    ).toBeNull();
  });

  it("accepts a valid input without project", () => {
    expect(validateDevRequestInput({ title: "Fix X", description: "Do Y" })).toBeNull();
  });

  it("rejects empty title", () => {
    expect(validateDevRequestInput({ title: "   ", description: "Do Y" })).toMatch(/title/i);
  });

  it("rejects missing title", () => {
    expect(validateDevRequestInput({ description: "Do Y" })).toMatch(/title/i);
  });

  it("rejects empty description", () => {
    expect(validateDevRequestInput({ title: "Fix X", description: "" })).toMatch(/description/i);
  });

  it("rejects missing description", () => {
    expect(validateDevRequestInput({ title: "Fix X" })).toMatch(/description/i);
  });

  it("rejects non-object input and non-string project", () => {
    expect(validateDevRequestInput(null)).toMatch(/invalid/i);
    expect(validateDevRequestInput("nope")).toMatch(/invalid/i);
    expect(validateDevRequestInput({ project: 3, title: "t", description: "d" })).toMatch(
      /project/i
    );
  });
});

describe("dev-request store round-trip", () => {
  let firstId = "";

  beforeAll(() => {
    const a = addDevRequest({
      project: "lifeos",
      title: "Add export button",
      description: "Export the brief as markdown",
    });
    firstId = a.id;
    addDevRequest({ title: "Tune cron jitter", description: "Randomise start within 10min" });
  });

  it("stores queued status + createdAt + fields", () => {
    const all = listDevRequests();
    expect(all).toHaveLength(2);
    const first = all.find((r) => r.id === firstId)!;
    expect(first.status).toBe("queued");
    expect(first.project).toBe("lifeos");
    expect(first.title).toBe("Add export button");
    expect(first.createdAt).toBeTruthy();
    expect(Number.isNaN(Date.parse(first.createdAt))).toBe(false);
  });

  it("omits project when unspecified", () => {
    const second = listDevRequests().find((r) => r.id !== firstId)!;
    expect(second.project).toBeUndefined();
  });

  it("lists queued only, then flips to done", () => {
    expect(listQueuedDevRequests()).toHaveLength(2);
    expect(completeDevRequest(firstId)).toBe(true);
    const remaining = listQueuedDevRequests();
    expect(remaining).toHaveLength(1);
    const done = listDevRequests().find((r) => r.id === firstId)!;
    expect(done.status).toBe("done");
    expect(done.completedAt).toBeTruthy();
  });

  it("returns false for unknown id (no status flip)", () => {
    expect(completeDevRequest("no-such-id")).toBe(false);
    expect(listQueuedDevRequests()).toHaveLength(1);
  });
});

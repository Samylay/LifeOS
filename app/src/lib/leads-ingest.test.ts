import { describe, it, expect, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

// getDb() caches the path on first use, so LIFEOS_DB_PATH must be set before
// any query runs — never point this at the real data/lifeos.db.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lifeos-leads-ingest-test-"));
process.env.LIFEOS_DB_PATH = path.join(tmpDir, "test.db");

const { enqueueLead, LEADS_COLLECTION } = await import("./leads-ingest");
const { getDoc } = await import("./server-db");

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("enqueueLead", () => {
  it("files a lead as new and keeps the caller's fields", () => {
    const { id, duplicate } = enqueueLead({
      source: "hn-pain",
      extId: "1",
      title: "jm4 — Show HN: BrowserOS",
      url: "https://news.ycombinator.com/item?id=1",
      budget: "—",
      categories: '"I would pay for"',
      brief: "Doing this manually can take days.",
      postedAt: "2026-07-01T00:00:00.000Z",
    });
    expect(duplicate).toBe(false);
    expect(id).toBeTruthy();

    const lead = getDoc(LEADS_COLLECTION, id!) as Record<string, unknown>;
    expect(lead.status).toBe("new");
    expect(lead.source).toBe("hn-pain");
    expect(lead.brief).toBe("Doing this manually can take days.");
    expect(lead.budget).toBe("—");
    expect(lead.budgetFloor).toBe(0);
    expect(lead.postedAt).toEqual({ __date: "2026-07-01T00:00:00.000Z" });
  });

  it("is idempotent on (source, extId) and returns the original id", () => {
    const first = enqueueLead({ source: "codeur", extId: "42", title: "site vitrine" });
    const again = enqueueLead({ source: "codeur", extId: "42", title: "changed" });
    expect(again.duplicate).toBe(true);
    expect(again.id).toBe(first.id);
    // The original row wins — a re-post must not rewrite a lead Samy may have
    // already moved to contacted.
    const kept = getDoc(LEADS_COLLECTION, first.id!) as Record<string, unknown>;
    expect(kept.title).toBe("site vitrine");
  });

  it("separates sources, so the same extId in two sources is not a dupe", () => {
    const a = enqueueLead({ source: "hn-pain", extId: "shared" });
    const b = enqueueLead({ source: "codeur", extId: "shared" });
    expect(b.duplicate).toBe(false);
    expect(b.id).not.toBe(a.id);
  });

  it("skips a row with no extId rather than filing an unkeyable lead", () => {
    expect(enqueueLead({ source: "hn-pain", title: "no id" })).toEqual({
      id: null,
      duplicate: false,
    });
  });

  it("keeps the Codeur defaults for fields a pain lead omits", () => {
    const { id } = enqueueLead({ source: "codeur", extId: "defaults" });
    const lead = getDoc(LEADS_COLLECTION, id!) as Record<string, unknown>;
    expect(lead.title).toBe("(untitled)");
    expect(lead.budget).toBe("non précisé");
  });
});

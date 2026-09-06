import { describe, it, expect, vi, afterAll, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

// server-db opens its sqlite file lazily on first query, so LIFEOS_DB_PATH
// must be set before any module that touches it is imported — never point
// this at the real data/lifeos.db (see server-db.test.ts for the same
// pattern).
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lifeos-extract-item-test-"));
process.env.LIFEOS_DB_PATH = path.join(tmpDir, "test.db");

vi.mock("../claude-cli", () => ({ generateJson: vi.fn() }));

const { generateJson } = await import("../claude-cli");
const { extractPassagesForItem, isSavedItem, candidatesFromModelQuotes, PASSAGES_COLLECTION } = await import(
  "./extract-item"
);
const { listDocs } = await import("../server-db");
import type { TriageItem } from "../triage";

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(generateJson).mockReset();
});

const SOURCE_TEXT =
  "Learning happens at the edge of what you already know. Comfort teaches nothing; friction is where retention lives, and repetition without friction is just exposure.";

function item(overrides: Partial<TriageItem> = {}): TriageItem {
  return {
    id: "triage-1",
    url: "https://example.com/an-article",
    rawUrl: "https://example.com/an-article",
    source: "other",
    savedAt: new Date(),
    status: "filed",
    createdAt: new Date(),
    ...overrides,
  };
}

function stubFetchOk(text: string) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, text: async () => text }));
}

describe("isSavedItem — only material Samy explicitly saved", () => {
  it("treats filed and done as saved", () => {
    expect(isSavedItem({ status: "filed" })).toBe(true);
    expect(isSavedItem({ status: "done" })).toBe(true);
  });

  it("treats queued, discarded, and deferred as not saved", () => {
    expect(isSavedItem({ status: "queued" })).toBe(false);
    expect(isSavedItem({ status: "discarded" })).toBe(false);
    expect(isSavedItem({ status: "deferred" })).toBe(false);
  });
});

describe("candidatesFromModelQuotes — a model's claim is only ever a lookup key", () => {
  it("locates a verbatim quote and records its real offsets", () => {
    const [c] = candidatesFromModelQuotes(SOURCE_TEXT, ["friction is where retention lives"]);
    expect(c).toBeDefined();
    expect(SOURCE_TEXT.slice(c.start, c.end)).toBe(c.quote);
  });

  it("drops a quote that does not occur in the source at all", () => {
    const candidates = candidatesFromModelQuotes(SOURCE_TEXT, ["this sentence was never in the article"]);
    expect(candidates).toEqual([]);
  });

  it("drops duplicate matches at the same offset", () => {
    const candidates = candidatesFromModelQuotes(SOURCE_TEXT, [
      "Learning happens at the edge",
      "Learning happens at the edge",
    ]);
    expect(candidates).toHaveLength(1);
  });
});

describe("extractPassagesForItem — an unsaved item is never read", () => {
  it("does not fetch or store anything for a queued item", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const result = await extractPassagesForItem(item({ id: "unsaved-1", status: "queued" }));
    expect(result).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("extractPassagesForItem — a login-walled source yields no passages cleanly", () => {
  it("produces no passages and no thrown error for an X link, without attempting a fetch", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const result = await extractPassagesForItem(
      item({ id: "x-item", url: "https://x.com/someone/status/999", status: "filed" })
    );
    expect(result).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("produces no passages when the fetch itself fails (dead link)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    const result = await extractPassagesForItem(item({ id: "dead-item", status: "filed" }));
    expect(result).toEqual([]);
  });
});

describe("extractPassagesForItem — passages are verbatim slices of the fetched source", () => {
  it("stores a passage exactly as it appears in the source text", async () => {
    stubFetchOk(SOURCE_TEXT);
    vi.mocked(generateJson).mockResolvedValue([{ quote: "friction is where retention lives" }]);
    const result = await extractPassagesForItem(item({ id: "good-item" }));
    expect(result).toHaveLength(1);
    expect(result[0].quote).toBe("friction is where retention lives");
    expect(SOURCE_TEXT.slice(result[0].start, result[0].end)).toBe(result[0].quote);
    expect(result[0].sourceItemId).toBe("good-item");

    const stored = listDocs(PASSAGES_COLLECTION, { where: [["sourceItemId", "==", "good-item"]] });
    expect(stored).toHaveLength(1);
  });

  it("refuses a candidate the model altered and stores nothing for it", async () => {
    stubFetchOk(SOURCE_TEXT);
    vi.mocked(generateJson).mockResolvedValue([{ quote: "friction is where retention thrives" }]);
    const result = await extractPassagesForItem(item({ id: "altered-item" }));
    expect(result).toEqual([]);
    const stored = listDocs(PASSAGES_COLLECTION, { where: [["sourceItemId", "==", "altered-item"]] });
    expect(stored).toHaveLength(0);
  });

  it("never stores the item's own generated summary as a passage", async () => {
    stubFetchOk(SOURCE_TEXT);
    // The model tries to hand back the study-step summary verbatim — it
    // simply doesn't occur in the fetched source, so it can't be located.
    vi.mocked(generateJson).mockResolvedValue([{ quote: "This article explains why friction aids memory." }]);
    const result = await extractPassagesForItem(
      item({ id: "summary-item", proposal: { summary: "This article explains why friction aids memory." } as never })
    );
    expect(result).toEqual([]);
  });
});

describe("extractPassagesForItem — re-running does not duplicate", () => {
  it("a second run over the same item with the same candidate stores nothing new", async () => {
    stubFetchOk(SOURCE_TEXT);
    vi.mocked(generateJson).mockResolvedValue([{ quote: "Comfort teaches nothing" }]);
    const first = await extractPassagesForItem(item({ id: "rerun-item" }));
    expect(first).toHaveLength(1);

    const second = await extractPassagesForItem(item({ id: "rerun-item" }));
    expect(second).toEqual([]);

    const stored = listDocs(PASSAGES_COLLECTION, { where: [["sourceItemId", "==", "rerun-item"]] });
    expect(stored).toHaveLength(1);
  });
});

describe("extractPassagesForItem — when nothing is worth keeping", () => {
  it("an empty model response yields no passages, not an error", async () => {
    stubFetchOk(SOURCE_TEXT);
    vi.mocked(generateJson).mockResolvedValue([]);
    const result = await extractPassagesForItem(item({ id: "empty-item" }));
    expect(result).toEqual([]);
  });

  it("a broken model response yields no passages, not a thrown error", async () => {
    stubFetchOk(SOURCE_TEXT);
    vi.mocked(generateJson).mockRejectedValue(new Error("model call failed"));
    const result = await extractPassagesForItem(item({ id: "broken-item" }));
    expect(result).toEqual([]);
  });
});

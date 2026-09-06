import { describe, it, expect, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lifeos-idea-bank-test-"));
process.env.LIFEOS_DB_PATH = path.join(tmpDir, "test.db");

const { listDocs } = await import("@/lib/server-db");
const { createIdeaBankEntry, deleteIdeaBankEntry } = await import("./idea-bank");

const COLLECTION = "users/local/contentIdeas";

afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

describe("createIdeaBankEntry / deleteIdeaBankEntry", () => {
  it("creates an unsorted idea and can remove it again by id", () => {
    const id = createIdeaBankEntry({ title: "a spoken idea", content: "a spoken idea" });
    expect(listDocs(COLLECTION, {}).some((d) => d.id === id)).toBe(true);

    deleteIdeaBankEntry(id);
    expect(listDocs(COLLECTION, {}).some((d) => d.id === id)).toBe(false);
  });
});

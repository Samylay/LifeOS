import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

// getDb() lazily opens the file on first use and caches env in a module-level
// singleton, so LIFEOS_DB_PATH must be set before any query runs — never
// point this at the real data/lifeos.db.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lifeos-server-db-test-"));
process.env.LIFEOS_DB_PATH = path.join(tmpDir, "test.db");

const { listDocs, getDoc, createDoc, updateDoc, setDoc, deleteDoc } = await import("./server-db");

const COLLECTION = "test-collection";

beforeAll(() => {
  createDoc(COLLECTION, { name: "alpha", rank: 3, tags: ["a", "b"] });
  createDoc(COLLECTION, { name: "beta", rank: 1, tags: ["b", "c"] });
  createDoc(COLLECTION, { name: "gamma", rank: 2, tags: ["a"] });
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("listDocs where ops", () => {
  it("filters with ==", () => {
    const docs = listDocs(COLLECTION, { where: [["name", "==", "alpha"]] });
    expect(docs).toHaveLength(1);
    expect(docs[0].name).toBe("alpha");
  });

  it("filters with !=", () => {
    const docs = listDocs(COLLECTION, { where: [["name", "!=", "alpha"]] });
    expect(docs.map((d) => d.name).sort()).toEqual(["beta", "gamma"]);
  });

  it("filters with < and >=", () => {
    expect(listDocs(COLLECTION, { where: [["rank", "<", 2]] }).map((d) => d.name)).toEqual([
      "beta",
    ]);
    expect(
      listDocs(COLLECTION, { where: [["rank", ">=", 2]] })
        .map((d) => d.name)
        .sort()
    ).toEqual(["alpha", "gamma"]);
  });

  it("filters with in / not-in", () => {
    expect(
      listDocs(COLLECTION, { where: [["name", "in", ["alpha", "gamma"]]] })
        .map((d) => d.name)
        .sort()
    ).toEqual(["alpha", "gamma"]);
    expect(listDocs(COLLECTION, { where: [["name", "not-in", ["alpha", "gamma"]]] })).toHaveLength(
      1
    );
  });

  it("filters with array-contains", () => {
    expect(
      listDocs(COLLECTION, { where: [["tags", "array-contains", "a"]] })
        .map((d) => d.name)
        .sort()
    ).toEqual(["alpha", "gamma"]);
  });

  it("compares date markers by epoch value, not object identity", () => {
    const DATED_COLLECTION = "test-collection-dates";
    const id = createDoc(DATED_COLLECTION, {
      name: "dated",
      when: { __date: "2026-01-01T00:00:00Z" },
    });
    const docs = listDocs(DATED_COLLECTION, {
      where: [["when", "<", { __date: "2026-06-01T00:00:00Z" }]],
    });
    expect(docs.map((d) => d.id)).toContain(id);
  });
});

describe("listDocs orderBy + limit", () => {
  it("sorts ascending and descending", () => {
    expect(listDocs(COLLECTION, { orderBy: ["rank", "asc"] }).map((d) => d.name)).toEqual([
      "beta",
      "gamma",
      "alpha",
    ]);
    expect(listDocs(COLLECTION, { orderBy: ["rank", "desc"] }).map((d) => d.name)).toEqual([
      "alpha",
      "gamma",
      "beta",
    ]);
  });

  it("applies limit after ordering", () => {
    const docs = listDocs(COLLECTION, { orderBy: ["rank", "asc"], limit: 2 });
    expect(docs.map((d) => d.name)).toEqual(["beta", "gamma"]);
  });
});

describe("doc CRUD", () => {
  it("createDoc + getDoc round-trip", () => {
    const id = createDoc(COLLECTION, { name: "delta" });
    expect(getDoc(COLLECTION, id)).toMatchObject({ id, name: "delta" });
  });

  it("updateDoc merges fields, setDoc replaces them", () => {
    const id = createDoc(COLLECTION, { name: "epsilon", extra: "keep-me" });
    updateDoc(COLLECTION, id, { name: "epsilon-updated" });
    expect(getDoc(COLLECTION, id)).toMatchObject({
      name: "epsilon-updated",
      extra: "keep-me",
    });

    setDoc(COLLECTION, id, { name: "epsilon-replaced" });
    expect(getDoc(COLLECTION, id)).toEqual({ id, name: "epsilon-replaced" });
  });

  it("setDoc with merge=true behaves like updateDoc", () => {
    const id = createDoc(COLLECTION, { name: "zeta", extra: "keep-me" });
    setDoc(COLLECTION, id, { name: "zeta-merged" }, true);
    expect(getDoc(COLLECTION, id)).toMatchObject({
      name: "zeta-merged",
      extra: "keep-me",
    });
  });

  it("deleteDoc removes the row", () => {
    const id = createDoc(COLLECTION, { name: "eta" });
    deleteDoc(COLLECTION, id);
    expect(getDoc(COLLECTION, id)).toBeNull();
  });

  it("getDoc returns null for a missing id", () => {
    expect(getDoc(COLLECTION, "does-not-exist")).toBeNull();
  });
});

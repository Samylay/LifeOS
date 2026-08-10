import { describe, it, expect, afterAll, beforeEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), "lifeos-kb-db-"));
process.env.LIFEOS_DB_PATH = path.join(dbDir, "test.db");
const vaultDir = fs.mkdtempSync(path.join(os.tmpdir(), "lifeos-kb-vault-"));
process.env.KB_PATH = vaultDir;

const { listNotes, searchNotes } = await import("./kb");

afterAll(() => {
  fs.rmSync(dbDir, { recursive: true, force: true });
  fs.rmSync(vaultDir, { recursive: true, force: true });
});

function writeNote(relPath: string, content: string) {
  const full = path.join(vaultDir, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, "utf-8");
}

beforeEach(() => {
  fs.rmSync(vaultDir, { recursive: true, force: true });
  fs.mkdirSync(vaultDir, { recursive: true });
});

describe("listNotes — no-query path", () => {
  it("lists every note newest-first, byte-identical shape to before", () => {
    writeNote("01-Inbox/older.md", "# Older\n\nsome text");
    const older = fs.statSync(path.join(vaultDir, "01-Inbox/older.md"));
    fs.utimesSync(path.join(vaultDir, "01-Inbox/older.md"), older.atime, new Date(Date.now() - 60000));
    writeNote("01-Inbox/newer.md", "# Newer\n\nother text");

    const notes = listNotes();
    expect(notes.map((n) => n.title)).toEqual(["Newer", "Older"]);
    expect(notes[0]).toEqual(
      expect.objectContaining({
        path: "01-Inbox/newer.md",
        title: "Newer",
        folder: "01-Inbox",
      })
    );
  });
});

describe("searchNotes — tokenized AND, order-independent", () => {
  it("finds a note when query words are out of order", () => {
    writeNote("01-Inbox/teach-queue.md", "# Teach queue\n\nThe teach queue picker logic.");
    writeNote("01-Inbox/unrelated.md", "# Unrelated\n\nnothing to do with it.");

    const outOfOrder = searchNotes("queue teach");
    expect(outOfOrder.notes.map((n) => n.path)).toContain("01-Inbox/teach-queue.md");

    const inOrder = searchNotes("teach queue");
    expect(inOrder.notes.map((n) => n.path)).toContain("01-Inbox/teach-queue.md");
  });

  it("AND-matches every term — a note missing one term is excluded", () => {
    writeNote("01-Inbox/only-teach.md", "# Only teach\n\njust the word teach here.");
    writeNote("01-Inbox/both.md", "# Both\n\nteach and queue both appear.");

    const result = searchNotes("teach queue");
    const paths = result.notes.map((n) => n.path);
    expect(paths).toContain("01-Inbox/both.md");
    expect(paths).not.toContain("01-Inbox/only-teach.md");
  });

  it("surfaces a known note via the one-typo-tolerant fallback", () => {
    writeNote("01-Inbox/distributed.md", "# Distributed systems\n\nconsensus and replication notes.");

    // "concensus" is one substitution away from "consensus" (edit distance 1).
    const typo = searchNotes("concensus");
    expect(typo.notes.map((n) => n.path)).toContain("01-Inbox/distributed.md");
    expect(typo.usedFallback).toBe(true);
  });

  it("returns suggestions instead of a bare dead end on a real zero-result query", () => {
    writeNote("01-Inbox/a.md", "# A\n\nsome content");
    writeNote("01-Inbox/b.md", "# B\n\nmore content");

    const result = searchNotes("zzzznomatchqqqq");
    expect(result.notes).toEqual([]);
    expect(result.suggestions && result.suggestions.length).toBeGreaterThan(0);
  });
});

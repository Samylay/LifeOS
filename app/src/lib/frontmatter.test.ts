import { describe, it, expect } from "vitest";
import { mergeFrontmatterTags, normalizeTags } from "./frontmatter";

describe("normalizeTags", () => {
  it("lowercases, kebabs, strips # and dedupes", () => {
    expect(normalizeTags(["Claude Code", "#ai", "claude-code"])).toEqual(["claude-code", "ai"]);
  });
  it("accepts a comma string and drops junk", () => {
    expect(normalizeTags("a, ###, , b")).toEqual(["a", "b"]);
  });
  it("is empty for undefined", () => {
    expect(normalizeTags(undefined)).toEqual([]);
  });
});

describe("mergeFrontmatterTags", () => {
  it("creates frontmatter when the note has none", () => {
    expect(mergeFrontmatterTags("# Triage\n\nbody\n", ["a", "b"]))
      .toBe("---\ntags: [a, b]\n---\n\n# Triage\n\nbody\n");
  });

  it("adds a tags key to existing frontmatter", () => {
    expect(mergeFrontmatterTags("---\ncreated: x\n---\nbody\n", ["a"]))
      .toBe("---\ncreated: x\ntags: [a]\n---\nbody\n");
  });

  it("unions into flow tags, existing first, no dupes", () => {
    expect(mergeFrontmatterTags("---\ntags: [keep, moc]\ncreated: x\n---\nb\n", ["moc", "new"]))
      .toBe("---\ntags: [keep, moc, new]\ncreated: x\n---\nb\n");
  });

  it("converts block-style tags to flow while keeping them", () => {
    expect(mergeFrontmatterTags("---\ntags:\n  - keep\n  - moc\n---\nb\n", ["new"]))
      .toBe("---\ntags: [keep, moc, new]\n---\nb\n");
  });

  it("never drops a tag the user already had", () => {
    const out = mergeFrontmatterTags("---\ntags: [mine]\n---\nb\n", ["theirs"]);
    expect(out).toContain("mine");
    expect(out).toContain("theirs");
  });

  it("returns the input unchanged when there is nothing new", () => {
    const src = "---\ntags: [a, b]\n---\nbody\n";
    expect(mergeFrontmatterTags(src, ["a", "b"])).toBe(src);
    expect(mergeFrontmatterTags(src, [])).toBe(src);
    expect(mergeFrontmatterTags(src, undefined)).toBe(src);
  });

  it("accumulates across items filed the same day — the whole point", () => {
    // The bug this replaces: Hermes tagged only the FIRST item of a day note.
    let note = "";
    note = mergeFrontmatterTags(note + "\n## x: u1\nfirst\n", ["rust", "cli"]);
    note = mergeFrontmatterTags(note + "\n## x: u2\nsecond\n", ["godot", "rust"]);
    note = mergeFrontmatterTags(note + "\n## x: u3\nthird\n", ["solarpunk"]);
    expect(note).toContain("tags: [rust, cli, godot, solarpunk]");
    // and every item's body survived the read-modify-writes
    expect(note).toContain("u1");
    expect(note).toContain("u2");
    expect(note).toContain("u3");
  });
});

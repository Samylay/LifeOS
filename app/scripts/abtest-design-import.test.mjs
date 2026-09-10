import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  allowedRemoteUrl,
  extractMainImages,
  extractTeaching,
  extractTestRecord,
  parseSitemap,
  stableSlug,
  writeCorpusAtomically,
} from "./abtest-design-import.mjs";

const temporaryDirs = [];

afterEach(async () => {
  await Promise.all(temporaryDirs.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

describe("A/B test corpus extraction", () => {
  it("allows only the public source and asset hosts", () => {
    expect(allowedRemoteUrl("https://abtest.design/tests/example").hostname).toBe("abtest.design");
    expect(allowedRemoteUrl("https://framerusercontent.com/images/example.png").hostname).toBe("framerusercontent.com");
    expect(() => allowedRemoteUrl("http://127.0.0.1/private")).toThrow(/allowlist/);
    expect(() => allowedRemoteUrl("https://example.com/redirect")).toThrow(/allowlist/);
  });

  it("extracts structured teaching and result paragraphs", () => {
    const entry = {
      title: "Clearer pricing estimate",
      h2: ["Uber", "•", "Checkout & sales", "Clearer pricing estimate"],
      p: ["Share feedback", "An experiment summary with enough detail to be teaching material.", "Results", "Double-digit increase in rides per user", "Source"],
    };
    expect(extractTeaching(entry)).toEqual({
      title: "Clearer pricing estimate",
      company: "Uber",
      category: "Checkout & sales",
      summary: "An experiment summary with enough detail to be teaching material.",
      results: ["Double-digit increase in rides per user"],
    });
  });

  it("keeps only ordered main experiment images and dedupes responsive variants", () => {
    const html = `
      <img src="https://framerusercontent.com/images/logo.svg">
      <div class="recommendation"><img src="https://framerusercontent.com/images/recommended.png"></div>
      <div class="framer-16lvn8g"><img src="https://framerusercontent.com/images/control.png" alt="control"></div>
      <div class="framer-16lvn8g"><img src="https://framerusercontent.com/images/control.png" alt="control"></div>
      <div class="framer-16lvn8g"><img src="https://framerusercontent.com/images/variant.png" data-role="variant"></div>
      <div data-framer-name="Content"><p>Teaching text</p></div>
      <div class="framer-16lvn8g"><img src="https://framerusercontent.com/images/recommended.png"></div>`;
    expect(extractMainImages(html)).toEqual([
      { originalUrl: "https://framerusercontent.com/images/control.png", label: "control" },
      { originalUrl: "https://framerusercontent.com/images/variant.png", label: "variant" },
    ]);
  });

  it("uses a stable path-derived slug and parses only test sitemap URLs", () => {
    expect(stableSlug("https://abtest.design/tests/30-day-guest-pass?utm_source=x")).toBe("30-day-guest-pass");
    expect(stableSlug("https://abtest.design/tests/Trial%20CTA")).toBe("trial-cta");
    expect(parseSitemap(`<urlset>
      <url><loc>https://abtest.design/</loc></url>
      <url><loc>https://abtest.design/tests/b</loc></url>
      <url><loc>https://abtest.design/tests/a/</loc></url>
      <url><loc>https://other.example/tests/no</loc></url>
    </urlset>`)).toEqual([
      "https://abtest.design/tests/a",
      "https://abtest.design/tests/b",
    ]);
  });

  it("builds a complete record with neutral image labels when markup is ambiguous", () => {
    const html = `<div class="framer-16lvn8g"><img src="https://framerusercontent.com/images/hero.webp" alt="control and variant"></div><div data-framer-name="Content"></div>`;
    const record = extractTestRecord({
      html,
      sourceUrl: "https://abtest.design/tests/example",
      searchIndexEntry: {
        title: "Example",
        h2: ["Acme", "•", "Misc", "Example"],
        p: ["Share feedback", "A useful experiment summary for this fixture.", "Results", "12% increase", "Source"],
      },
    });
    expect(record.images).toEqual([{ originalUrl: "https://framerusercontent.com/images/hero.webp", label: "experiment" }]);
  });
});

describe("atomic corpus replacement", () => {
  it("leaves the previous valid corpus when staged validation fails", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "abtest-import-test-"));
    temporaryDirs.push(root);
    const outputDir = path.join(root, "corpus");
    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(path.join(outputDir, "manifest.json"), '{"version":1,"tests":[{"slug":"old"}]}');
    await expect(writeCorpusAtomically(outputDir, [{ slug: "new", images: [{ file: "images/new/missing.png" }] }], [], 1)).rejects.toThrow();
    expect(await fs.readFile(path.join(outputDir, "manifest.json"), "utf8")).toContain('"old"');
  });

  it("rejects unsafe paths before writing outside the staging directory", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "abtest-import-path-test-"));
    temporaryDirs.push(root);
    await expect(writeCorpusAtomically(
      path.join(root, "corpus"),
      [{ slug: "safe", images: [] }],
      [{ slug: "../escape", filename: "image.png", bytes: new Uint8Array([1]) }],
      1
    )).rejects.toThrow(/Unsafe image slug/);
  });
});

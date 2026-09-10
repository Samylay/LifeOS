import { afterAll, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getAbTestImageUrl, loadAbTestCases, loadAbTestManifest } from "./abtest-design";

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "lifeos-abtest-loader-test-"));

beforeEach(() => {
  process.env.ABTEST_CONTENT_DIR = path.join(tmpRoot, "corpus");
  fs.rmSync(process.env.ABTEST_CONTENT_DIR, { recursive: true, force: true });
});

afterAll(() => fs.rmSync(tmpRoot, { recursive: true, force: true }));

function writeManifest(value: unknown): void {
  const root = process.env.ABTEST_CONTENT_DIR!;
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, "manifest.json"), JSON.stringify(value));
}

describe("loadAbTestCases", () => {
  it("returns an empty collection when the manifest is missing or malformed", () => {
    expect(loadAbTestCases()).toEqual([]);
    writeManifest({ version: 2, tests: [] });
    expect(loadAbTestCases()).toEqual([]);
    fs.writeFileSync(path.join(process.env.ABTEST_CONTENT_DIR!, "manifest.json"), "not json");
    expect(loadAbTestManifest()).toBeNull();
  });

  it("accepts version 1 and normalizes fields without writing", () => {
    writeManifest({
      version: 1,
      source: " https://abtest.design/ ",
      fetchedAt: " 2026-09-10T00:00:00Z ",
      tests: [
        {
          slug: " button-test ",
          title: "  Button test ",
          company: " Company ",
          category: " CTA ",
          summary: " Summary ",
          results: [" +12% ", 42, ""],
          sourceUrl: " https://abtest.design/tests/button-test ",
          images: [
            { file: " images/button/control.png ", originalUrl: " remote ", label: " control " },
            { file: " ", originalUrl: "ignored" },
            "not an image",
          ],
        },
        { slug: "button-test", title: "duplicate" },
        { slug: "../unsafe", title: "unsafe slug" },
        { slug: "missing-title" },
        "not a test",
      ],
    });

    expect(loadAbTestCases()).toEqual([
      {
        slug: "button-test",
        title: "Button test",
        company: "Company",
        category: "CTA",
        summary: "Summary",
        results: ["+12%"],
        sourceUrl: "https://abtest.design/tests/button-test",
        images: [{ file: "images/button/control.png", originalUrl: "remote", label: "control" }],
      },
    ]);
    expect(fs.existsSync(path.join(process.env.ABTEST_CONTENT_DIR!, "manifest.json"))).toBe(true);
  });

  it("drops unsafe image paths and source links", () => {
    writeManifest({
      version: 1,
      tests: [{
        slug: "safe-test",
        title: "Safe test",
        sourceUrl: "javascript:alert(1)",
        images: [
          { file: "../secret.png" },
          { file: "images/safe-test/test.svg" },
          { file: "images/safe-test/test.png", label: "experiment" },
        ],
      }],
    });
    expect(loadAbTestCases()[0]).toMatchObject({
      sourceUrl: "",
      images: [{ file: "images/safe-test/test.png", label: "experiment" }],
    });
  });
});

describe("getAbTestImageUrl", () => {
  it("encodes each path segment while retaining path structure", () => {
    expect(getAbTestImageUrl("images/a test/control.png")).toBe(
      "/api/ab-tests/images/images/a%20test/control.png"
    );
  });
});

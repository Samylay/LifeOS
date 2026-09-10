import { afterAll, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "lifeos-abtest-images-test-"));
process.env.ABTEST_CONTENT_DIR = path.join(tmpRoot, "corpus");

const { GET } = await import("./route");

beforeEach(() => {
  fs.rmSync(process.env.ABTEST_CONTENT_DIR!, { recursive: true, force: true });
  fs.mkdirSync(path.join(process.env.ABTEST_CONTENT_DIR!, "images", "case"), { recursive: true });
  fs.writeFileSync(
    path.join(process.env.ABTEST_CONTENT_DIR!, "images", "case", "control.png"),
    Buffer.from("png fixture")
  );
  fs.writeFileSync(path.join(process.env.ABTEST_CONTENT_DIR!, "notes.txt"), "not an image");
});

afterAll(() => fs.rmSync(tmpRoot, { recursive: true, force: true }));

function request(): Request {
  return new Request("http://localhost/api/ab-tests/images/images/case/control.png");
}

function context(...segments: string[]) {
  return { params: Promise.resolve({ path: segments }) };
}

describe("GET /api/ab-tests/images/[...path]", () => {
  it("serves a regular image file with safe headers", async () => {
    const response = await GET(request(), context("images", "case", "control.png"));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("image/png");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("cache-control")).toBe("private, max-age=3600");
    expect(await response.text()).toBe("png fixture");
  });

  it.each([
    ["traversal", ["images", "..", "notes.txt"]],
    ["encoded traversal", ["images", "%2e%2e", "notes.txt"]],
    ["missing", ["images", "case", "missing.png"]],
    ["unknown extension", ["notes.txt"]],
    ["directory", ["images", "case"]],
  ])("rejects %s", async (_name, segments) => {
    const response = await GET(request(), context(...segments));
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
  });

  it("rejects a symlink escaping the corpus root", async () => {
    const outside = path.join(tmpRoot, "outside.png");
    fs.writeFileSync(outside, "secret");
    fs.symlinkSync(outside, path.join(process.env.ABTEST_CONTENT_DIR!, "images", "escape.png"));
    const response = await GET(request(), context("images", "escape.png"));
    expect(response.status).toBe(400);
  });
});

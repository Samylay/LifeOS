import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { saveInboxPhoto } from "./photo-inbox";
const directories: string[] = [];
afterEach(() => directories.splice(0).forEach(directory => rmSync(directory, { recursive: true, force: true })));
it("captures original image bytes and caption in a linked inbox note", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "photo-inbox-")); directories.push(directory);
  const bytes = Buffer.concat([Buffer.from([255,216,255]), Buffer.alloc(20)]);
  const saved = saveInboxPhoto(bytes, "image/jpeg", "A raw caption!", directory);
  const note = readFileSync(path.join(directory, saved.path), "utf8");
  expect(note).toContain("A raw caption!");
  const image = note.match(/\.\/([^)]*\.jpg)/)![1];
  expect(readFileSync(path.join(directory, "01-Inbox/photos", image))).toEqual(bytes);
  expect(readdirSync(path.join(directory, "01-Inbox/photos"))).toHaveLength(2);
});
it("rejects disguised image bytes and unsupported formats before writing", () => {
  expect(() => saveInboxPhoto(Buffer.alloc(30), "image/jpeg", "")).toThrow("Choose a JPEG");
  expect(() => saveInboxPhoto(Buffer.alloc(30), "image/svg+xml", "")).toThrow("Choose a JPEG");
});

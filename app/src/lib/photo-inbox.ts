import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync, chownSync } from "node:fs";
import path from "node:path";

export const MAX_INBOX_PHOTO_BYTES = 2_500_000;
export function saveInboxPhoto(bytes: Buffer, mime: string, caption: string, vault = process.env.KB_PATH || "/vault") {
  if (bytes.length < 12 || bytes.length > MAX_INBOX_PHOTO_BYTES) throw new Error("Photo must be at most 2.5 MB");
  if (caption.length > 4000) throw new Error("Caption is too long");
  const extensions: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
  const extension = extensions[mime];
  const valid = mime === "image/jpeg" ? bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
    : mime === "image/png" ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : mime === "image/webp" && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  if (!extension || !valid) throw new Error("Choose a JPEG, PNG or WebP photo");
  const id = `${new Date().toISOString().slice(0, 10)}-${randomUUID()}`;
  const directory = path.join(vault, "01-Inbox/photos");
  mkdirSync(directory, { recursive: true });
  const imagePath = path.join(directory, `${id}.${extension}`);
  const notePath = path.join(directory, `${id}.md`);
  writeFileSync(imagePath, bytes, { flag: "wx" });
  writeFileSync(notePath, `# Photo capture\n\nCaptured: ${new Date().toISOString()}\n\n${caption ? `${caption}\n\n` : ""}![Captured photo](./${id}.${extension})\n`, { flag: "wx" });
  for (const file of [directory, imagePath, notePath]) {
    try { chownSync(file, Number(process.env.KB_UID || 1000), Number(process.env.KB_GID || 1000)); } catch { /* Local dev already owns these files. */ }
  }
  return { path: `01-Inbox/photos/${id}.md` };
}

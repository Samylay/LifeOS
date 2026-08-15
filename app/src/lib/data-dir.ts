// Server-side only. Resolves the directory that holds persisted state next to
// the SQLite DB (`/data` in the container, `app/data` in dev). Anything that
// must survive a restart — rotated OAuth tokens, Garmin session tokens — lands
// here rather than in process memory.
import path from "node:path";
import fs from "node:fs";

export function dataDir(): string {
  const dbPath =
    process.env.LIFEOS_DB_PATH || path.join(process.cwd(), "data", "lifeos.db");
  const dir = path.dirname(dbPath);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// FTS5-backed search index for the knowledge-base vault. Additive-only: a new
// virtual table in the same SQLite DB server-db.ts uses (never touches the
// existing `docs` table). Kept separate from kb.ts's file-walking read path,
// which stays byte-identical for the no-query case.
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (_db) return _db;
  const dbPath = process.env.LIFEOS_DB_PATH || path.join(process.cwd(), "data", "lifeos.db");
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  _db = new Database(dbPath);
  _db.pragma("journal_mode = WAL");
  _db.pragma("busy_timeout = 5000");
  _db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS kb_fts USING fts5(
      relpath UNINDEXED, title, content, tags,
      tokenize = 'unicode61'
    );
    CREATE TABLE IF NOT EXISTS kb_fts_meta (
      relpath TEXT PRIMARY KEY,
      mtime REAL NOT NULL
    );
  `);
  return _db;
}

/** Reset the cached connection — test-only, mirrors server-db.test.ts's pattern. */
export function _resetDbForTests(): void {
  _db?.close();
  _db = null;
}

export interface IndexableFile {
  relpath: string;
  mtime: number;
  title: string;
  content: string;
  tags: string[];
}

/**
 * Bring kb_fts in sync with the current vault state. Only re-reads files
 * whose mtime changed since the last sync, and drops rows for files that no
 * longer exist. `files` is provided by the caller (kb.ts already walks the
 * tree) so this module has no filesystem-walking logic of its own.
 */
export function syncFtsIndex(files: IndexableFile[]): void {
  const db = getDb();
  const known = new Map(
    (db.prepare("SELECT relpath, mtime FROM kb_fts_meta").all() as { relpath: string; mtime: number }[]).map(
      (r) => [r.relpath, r.mtime]
    )
  );
  const seen = new Set<string>();

  const run = db.transaction((items: IndexableFile[]) => {
    for (const f of items) {
      seen.add(f.relpath);
      if (known.get(f.relpath) === f.mtime) continue;
      db.prepare("DELETE FROM kb_fts WHERE relpath = ?").run(f.relpath);
      db.prepare("INSERT INTO kb_fts (relpath, title, content, tags) VALUES (?, ?, ?, ?)").run(
        f.relpath,
        f.title,
        f.content,
        f.tags.join(" ")
      );
      db.prepare(
        `INSERT INTO kb_fts_meta (relpath, mtime) VALUES (?, ?)
         ON CONFLICT(relpath) DO UPDATE SET mtime = excluded.mtime`
      ).run(f.relpath, f.mtime);
    }
    for (const relpath of known.keys()) {
      if (!seen.has(relpath)) {
        db.prepare("DELETE FROM kb_fts WHERE relpath = ?").run(relpath);
        db.prepare("DELETE FROM kb_fts_meta WHERE relpath = ?").run(relpath);
      }
    }
  });
  run(files);
}

/** Split a query into lowercase tokens; word order and case stop mattering. */
export function tokenizeQuery(q: string): string[] {
  return q
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

function escapeFtsTerm(term: string): string {
  return `"${term.replace(/"/g, '""')}"`;
}

/** AND every token together; prefix-match only the last (still-being-typed) one. */
function buildMatchExpr(tokens: string[]): string {
  return tokens.map((t, i) => (i === tokens.length - 1 ? `${escapeFtsTerm(t)}*` : escapeFtsTerm(t))).join(" AND ");
}

function levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

/** Nearest indexed word to `token` within edit distance 1, or null if none. */
function nearestIndexedTerm(db: Database.Database, token: string): string | null {
  if (token.length < 3) return null;
  let vocab: { term: string }[];
  try {
    db.exec("CREATE VIRTUAL TABLE IF NOT EXISTS kb_fts_vocab USING fts5vocab(kb_fts, 'row')");
    vocab = db.prepare("SELECT term FROM kb_fts_vocab").all() as { term: string }[];
  } catch {
    return null;
  }
  let best: string | null = null;
  let bestDist = 2; // only accept distance <= 1
  for (const { term } of vocab) {
    if (Math.abs(term.length - token.length) > 1) continue;
    const d = levenshtein(token, term);
    if (d < bestDist) {
      bestDist = d;
      best = term;
    }
  }
  return bestDist <= 1 ? best : null;
}

export interface FtsSearchResult {
  relpaths: string[];
  usedFallback: boolean;
}

/**
 * Tokenized AND search over the FTS index, falling back to a one-typo-tolerant
 * retry (nearest indexed word per token) when the exact query has 0 hits.
 */
export function searchFts(query: string, limit: number): FtsSearchResult {
  const db = getDb();
  const tokens = tokenizeQuery(query);
  if (!tokens.length) return { relpaths: [], usedFallback: false };

  const primary = db
    .prepare(`SELECT relpath FROM kb_fts WHERE kb_fts MATCH ? ORDER BY bm25(kb_fts) LIMIT ?`)
    .all(buildMatchExpr(tokens), limit) as { relpath: string }[];
  if (primary.length) return { relpaths: primary.map((r) => r.relpath), usedFallback: false };

  const corrected = tokens.map((t) => nearestIndexedTerm(db, t) ?? t);
  if (corrected.join(" ") === tokens.join(" ")) return { relpaths: [], usedFallback: false };

  const fallback = db
    .prepare(`SELECT relpath FROM kb_fts WHERE kb_fts MATCH ? ORDER BY bm25(kb_fts) LIMIT ?`)
    .all(buildMatchExpr(corrected), limit) as { relpath: string }[];
  return { relpaths: fallback.map((r) => r.relpath), usedFallback: fallback.length > 0 };
}

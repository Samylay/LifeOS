// Server-side only — local SQLite document store that replaces Firestore.
//
// Firestore is schemaless (collections of JSON documents), so we mirror that
// with a single table keyed by (collection path, doc id) holding a JSON blob.
// Dates are stored as `{ "__date": "<iso>" }` markers (produced by the client
// in firestore.ts), which lets us compare/sort them in queries.
import Database from "better-sqlite3";
import { randomUUID } from "crypto";
import path from "path";
import fs from "fs";

export type WhereOp =
  | "=="
  | "!="
  | "<"
  | "<="
  | ">"
  | ">="
  | "in"
  | "not-in"
  | "array-contains";

export interface QuerySpec {
  where?: [string, WhereOp, unknown][];
  orderBy?: [string, "asc" | "desc"];
  limit?: number;
}

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (_db) return _db;
  const dbPath = process.env.LIFEOS_DB_PATH || path.join(process.cwd(), "data", "lifeos.db");
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  _db = new Database(dbPath);
  _db.pragma("journal_mode = WAL");
  _db.exec(
    `CREATE TABLE IF NOT EXISTS docs (
       path TEXT NOT NULL,
       id   TEXT NOT NULL,
       data TEXT NOT NULL,
       PRIMARY KEY (path, id)
     )`
  );
  return _db;
}

function isDateMarker(v: unknown): v is { __date: string } {
  return Boolean(v) && typeof v === "object" && "__date" in (v as object);
}

/** Normalise a value for comparison: date markers -> epoch ms. */
function cmp(v: unknown): unknown {
  if (isDateMarker(v)) return Date.parse(v.__date);
  return v;
}

function matchesWhere(docVal: unknown, op: WhereOp, target: unknown): boolean {
  const a = cmp(docVal);
  const b = cmp(target);
  switch (op) {
    case "==":
      return a === b;
    case "!=":
      return a !== b;
    case "<":
      return (a as number) < (b as number);
    case "<=":
      return (a as number) <= (b as number);
    case ">":
      return (a as number) > (b as number);
    case ">=":
      return (a as number) >= (b as number);
    case "in":
      return Array.isArray(target) && (target as unknown[]).map(cmp).includes(a);
    case "not-in":
      return Array.isArray(target) && !(target as unknown[]).map(cmp).includes(a);
    case "array-contains":
      return Array.isArray(docVal) && (docVal as unknown[]).map(cmp).includes(b);
    default:
      return false;
  }
}

type Doc = Record<string, unknown> & { id: string };

export function listDocs(collectionPath: string, spec: QuerySpec = {}): Doc[] {
  const rows = getDb()
    .prepare("SELECT id, data FROM docs WHERE path = ?")
    .all(collectionPath) as { id: string; data: string }[];

  let docs: Doc[] = rows.map((r) => ({ id: r.id, ...JSON.parse(r.data) }));

  if (spec.where) {
    for (const [field, op, value] of spec.where) {
      docs = docs.filter((d) => matchesWhere(d[field], op, value));
    }
  }

  if (spec.orderBy) {
    const [field, dir] = spec.orderBy;
    const mul = dir === "desc" ? -1 : 1;
    docs.sort((x, y) => {
      const a = cmp(x[field]) as number | string;
      const b = cmp(y[field]) as number | string;
      if (a === b) return 0;
      if (a === undefined || a === null) return 1;
      if (b === undefined || b === null) return -1;
      return (a < b ? -1 : 1) * mul;
    });
  }

  if (typeof spec.limit === "number") docs = docs.slice(0, spec.limit);
  return docs;
}

export function getDoc(collectionPath: string, id: string): Doc | null {
  const row = getDb()
    .prepare("SELECT data FROM docs WHERE path = ? AND id = ?")
    .get(collectionPath, id) as { data: string } | undefined;
  if (!row) return null;
  return { id, ...JSON.parse(row.data) };
}

export function createDoc(collectionPath: string, data: Record<string, unknown>): string {
  const id = randomUUID();
  getDb()
    .prepare("INSERT INTO docs (path, id, data) VALUES (?, ?, ?)")
    .run(collectionPath, id, JSON.stringify(data));
  return id;
}

export function updateDoc(
  collectionPath: string,
  id: string,
  partial: Record<string, unknown>
): void {
  const existing = getDoc(collectionPath, id);
  const { id: _omit, ...rest } = existing ?? {};
  void _omit;
  const merged = { ...rest, ...partial };
  getDb()
    .prepare(
      `INSERT INTO docs (path, id, data) VALUES (?, ?, ?)
       ON CONFLICT(path, id) DO UPDATE SET data = excluded.data`
    )
    .run(collectionPath, id, JSON.stringify(merged));
}

export function setDoc(
  collectionPath: string,
  id: string,
  data: Record<string, unknown>,
  merge = false
): void {
  if (merge) {
    updateDoc(collectionPath, id, data);
    return;
  }
  getDb()
    .prepare(
      `INSERT INTO docs (path, id, data) VALUES (?, ?, ?)
       ON CONFLICT(path, id) DO UPDATE SET data = excluded.data`
    )
    .run(collectionPath, id, JSON.stringify(data));
}

export function deleteDoc(collectionPath: string, id: string): void {
  getDb().prepare("DELETE FROM docs WHERE path = ? AND id = ?").run(collectionPath, id);
}

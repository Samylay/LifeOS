// Client-side Firestore-compatible shim.
//
// The hooks were written against the Firestore SDK (`collection`, `query`,
// `onSnapshot`, `Timestamp`, …). Rather than rewrite every hook, this module
// re-implements that small surface on top of the local `/api/data` store:
//   - reads use fetch-on-mount + light polling instead of realtime listeners
//   - writes go through firestore.ts (which also targets /api/data)
//   - dates are carried as `{ __date: iso }` markers and revived to a
//     Firestore-Timestamp-like object exposing `.toDate()`.
//
// Hooks only need their import path changed from "firebase/firestore" to here.

const POLL_MS = 4000;

// Truthy sentinels so existing `if (!db)` / `isConfigured` guards stay happy.
export const db = { __local: true };
export const isConfigured = true;

export class Timestamp {
  constructor(private readonly iso: string) {}
  static fromDate(d: Date): Timestamp {
    return new Timestamp(d.toISOString());
  }
  static now(): Timestamp {
    return new Timestamp(new Date().toISOString());
  }
  toDate(): Date {
    return new Date(this.iso);
  }
  get seconds(): number {
    return Math.floor(Date.parse(this.iso) / 1000);
  }
  toJSON() {
    return { __date: this.iso };
  }
}

function isDateMarker(v: unknown): v is { __date: string } {
  return Boolean(v) && typeof v === "object" && "__date" in (v as object);
}

/** Date / Timestamp -> `{ __date: iso }` markers, recursively. */
export function serializeDates(value: unknown): unknown {
  if (value instanceof Date) return { __date: value.toISOString() };
  if (value instanceof Timestamp) return value.toJSON();
  if (Array.isArray(value)) return value.map(serializeDates);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) out[k] = serializeDates(v);
    }
    return out;
  }
  return value;
}

/** `{ __date: iso }` markers -> Timestamp, recursively. */
export function reviveDates(value: unknown): unknown {
  if (isDateMarker(value)) return new Timestamp(value.__date);
  if (Array.isArray(value)) return value.map(reviveDates);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = reviveDates(v);
    }
    return out;
  }
  return value;
}

// --- Reference / constraint descriptors -------------------------------------

type Constraint =
  | { __c: "where"; field: string; op: string; value: unknown }
  | { __c: "orderBy"; field: string; dir: "asc" | "desc" }
  | { __c: "limit"; n: number };

export type QueryConstraint = Constraint;

interface CollectionRef {
  __type: "collection";
  path: string;
}
interface DocRef {
  __type: "doc";
  path: string;
}
interface QueryRef {
  __type: "query";
  path: string;
  constraints: Constraint[];
}

export function collection(_db: unknown, ...segments: string[]): CollectionRef {
  return { __type: "collection", path: segments.join("/") };
}

export function doc(_db: unknown, ...segments: string[]): DocRef {
  return { __type: "doc", path: segments.join("/") };
}

export function where(field: string, op: string, value: unknown): Constraint {
  return { __c: "where", field, op, value };
}

export function orderBy(field: string, dir: "asc" | "desc" = "asc"): Constraint {
  return { __c: "orderBy", field, dir };
}

export function limit(n: number): Constraint {
  return { __c: "limit", n };
}

export function query(
  ref: CollectionRef | QueryRef,
  ...constraints: Constraint[]
): QueryRef {
  const base = "constraints" in ref ? ref.constraints : [];
  return { __type: "query", path: ref.path, constraints: [...base, ...constraints] };
}

export function buildQueryString(constraints: Constraint[]): string {
  const spec: {
    where?: [string, string, unknown][];
    orderBy?: [string, "asc" | "desc"];
    limit?: number;
  } = {};
  for (const c of constraints) {
    if (c.__c === "where") {
      (spec.where ??= []).push([c.field, c.op, serializeDates(c.value)]);
    } else if (c.__c === "orderBy") {
      spec.orderBy = [c.field, c.dir];
    } else if (c.__c === "limit") {
      spec.limit = c.n;
    }
  }
  return Object.keys(spec).length
    ? `?q=${encodeURIComponent(JSON.stringify(spec))}`
    : "";
}

// --- Snapshot helpers --------------------------------------------------------

// Mirror Firestore's DocumentData (values are `any`) so existing hook code like
// `data.createdAt?.toDate?.()` keeps type-checking unchanged.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DocData = Record<string, any>;

interface DocSnap {
  id: string;
  exists: () => boolean;
  data: () => DocData;
}
interface QuerySnap {
  docs: DocSnap[];
}

function stripId(doc: Record<string, unknown>): DocData {
  const { id: _omit, ...rest } = doc;
  void _omit;
  return reviveDates(rest) as DocData;
}

type Unsubscribe = () => void;

/** Realtime listener replacement: fetch now + poll. */
export function onSnapshot(
  target: CollectionRef | QueryRef | DocRef,
  callback: (snap: QuerySnap & DocSnap) => void
): Unsubscribe {
  let cancelled = false;

  const fetchOnce = async () => {
    try {
      if (target.__type === "doc") {
        const res = await fetch(`/api/data/${target.path}`);
        if (!res.ok || cancelled) return;
        const { doc } = await res.json();
        const snap = {
          id: target.path.split("/").pop() ?? "",
          exists: () => Boolean(doc),
          data: () => (doc ? stripId(doc) : {}),
          docs: [],
        } as unknown as QuerySnap & DocSnap;
        callback(snap);
      } else {
        const qs =
          target.__type === "query" ? buildQueryString(target.constraints) : "";
        const res = await fetch(`/api/data/${target.path}${qs}`);
        if (!res.ok || cancelled) return;
        const { docs } = await res.json();
        const snap = {
          docs: (docs as Record<string, unknown>[]).map((d) => ({
            id: d.id as string,
            exists: () => true,
            data: () => stripId(d),
          })),
        } as unknown as QuerySnap & DocSnap;
        callback(snap);
      }
    } catch {
      // Server unreachable — leave last state in place.
    }
  };

  fetchOnce();
  const interval = setInterval(fetchOnce, POLL_MS);
  return () => {
    cancelled = true;
    clearInterval(interval);
  };
}

export async function getDoc(ref: DocRef): Promise<DocSnap> {
  const res = await fetch(`/api/data/${ref.path}`);
  const { doc } = res.ok ? await res.json() : { doc: null };
  return {
    id: ref.path.split("/").pop() ?? "",
    exists: () => Boolean(doc),
    data: () => (doc ? stripId(doc) : {}),
  };
}

export async function setDoc(
  ref: DocRef,
  data: Record<string, unknown>,
  options?: { merge?: boolean }
): Promise<void> {
  await fetch(`/api/data/${ref.path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: serializeDates(data), merge: Boolean(options?.merge) }),
  });
}

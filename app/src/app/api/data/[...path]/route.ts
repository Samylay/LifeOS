// Generic CRUD over the local SQLite document store. Mirrors Firestore's
// path model: an odd number of segments is a collection (e.g.
// `users/local/tasks`), an even number is a document (`users/local/tasks/<id>`).
import { NextRequest, NextResponse } from "next/server";
import {
  listDocs,
  getDoc,
  createDoc,
  updateDoc,
  setDoc,
  deleteDoc,
  type QuerySpec,
} from "@/lib/server-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ path: string[] }> };

const IMMUTABLE_TRIAGE_COLLECTIONS = new Set([
  "users/local/triageEvidence",
  "users/local/triageAssessments",
]);

function split(segments: string[]) {
  const isCollection = segments.length % 2 === 1;
  if (isCollection) return { collectionPath: segments.join("/"), id: null as string | null };
  return {
    collectionPath: segments.slice(0, -1).join("/"),
    id: segments[segments.length - 1],
  };
}

function immutable(collectionPath: string): boolean {
  return IMMUTABLE_TRIAGE_COLLECTIONS.has(collectionPath);
}

export async function GET(req: NextRequest, { params }: Ctx) {
  const { path } = await params;
  const { collectionPath, id } = split(path);

  if (id === null) {
    const raw = req.nextUrl.searchParams.get("q");
    const spec: QuerySpec = raw ? JSON.parse(raw) : {};
    return NextResponse.json({ docs: listDocs(collectionPath, spec) });
  }

  const doc = getDoc(collectionPath, id);
  return NextResponse.json({ doc });
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const { path } = await params;
  const { collectionPath, id } = split(path);
  if (id !== null) {
    return NextResponse.json({ error: "POST targets a collection" }, { status: 400 });
  }
  if (immutable(collectionPath)) return NextResponse.json({ error: "immutable collection" }, { status: 405 });
  const data = await req.json();
  const newId = createDoc(collectionPath, data);
  return NextResponse.json({ id: newId });
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { path } = await params;
  const { collectionPath, id } = split(path);
  if (id === null) {
    return NextResponse.json({ error: "PATCH targets a document" }, { status: 400 });
  }
  if (immutable(collectionPath)) return NextResponse.json({ error: "immutable collection" }, { status: 405 });
  updateDoc(collectionPath, id, await req.json());
  return NextResponse.json({ ok: true });
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  const { path } = await params;
  const { collectionPath, id } = split(path);
  if (id === null) {
    return NextResponse.json({ error: "PUT targets a document" }, { status: 400 });
  }
  if (immutable(collectionPath)) return NextResponse.json({ error: "immutable collection" }, { status: 405 });
  const body = await req.json();
  const data = (body?.data ?? body) as Record<string, unknown>;
  const merge = Boolean(body?.merge);
  setDoc(collectionPath, id, data, merge);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { path } = await params;
  const { collectionPath, id } = split(path);
  if (id === null) {
    return NextResponse.json({ error: "DELETE targets a document" }, { status: 400 });
  }
  if (immutable(collectionPath)) return NextResponse.json({ error: "immutable collection" }, { status: 405 });
  deleteDoc(collectionPath, id);
  return NextResponse.json({ ok: true });
}

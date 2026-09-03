// Archive or restore one project (T-projects-rework-03).
//
// Archiving is the one piece of stored state on this surface, and it is
// stored because it is a deliberate act by Samy rather than a fact about the
// repo. It is also the only write here: the repo itself is never touched.
//
// Recoverable by construction — this flips a flag keyed by repo name and
// deletes nothing, so restoring is the same call with archived: false.
import { NextRequest, NextResponse } from "next/server";
import { listDocs, createDoc, updateDoc } from "@/lib/server-db";
import { ARCHIVE_COLLECTION, invalidateProjects } from "@/lib/projects/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: { name?: unknown; archived?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  const archived = body.archived !== false;

  const existing = listDocs(ARCHIVE_COLLECTION, { where: [["name", "==", name]] });
  if (existing[0]) {
    updateDoc(ARCHIVE_COLLECTION, String(existing[0].id), {
      archived,
      updatedAt: { __date: new Date().toISOString() },
    });
  } else {
    createDoc(ARCHIVE_COLLECTION, {
      name,
      archived,
      createdAt: { __date: new Date().toISOString() },
    });
  }

  // Reflect the change now rather than making Samy wait out the freshness
  // window to see the gesture he just made land.
  await invalidateProjects();
  return NextResponse.json({ ok: true, result: archived ? "archived" : "restored" });
}

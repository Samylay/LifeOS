// Derived project state for /projects. Never blocks on a repo scan: it serves
// the last snapshot with the stamp saying when it was taken, and a refresh
// runs in the background once that ages out.
import { NextResponse } from "next/server";
import { readProjects } from "@/lib/projects/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const snapshot = readProjects();
  return NextResponse.json(snapshot);
}

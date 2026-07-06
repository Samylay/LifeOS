import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import fixture from "@/components/brief/fixture.json";

// The aggregator on the host writes brief.json to ~/services/brief/out/,
// mounted read-only into this container at /brief. Until the first real run
// (or if the mount is missing) we serve the bundled fixture, flagged as such
// so the page can show a "sample data" badge.
const BRIEF_PATH = process.env.BRIEF_PATH || "/brief/brief.json";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const raw = fs.readFileSync(path.resolve(BRIEF_PATH), "utf8");
    return NextResponse.json(
      { source: "live", brief: JSON.parse(raw) },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json(
      { source: "fixture", brief: fixture },
      { headers: { "Cache-Control": "no-store" } }
    );
  }
}

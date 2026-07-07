import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import fixture from "@/components/brief/fixture.json";
import { BRIEF_OUT } from "@/lib/brief/builder";

// The brief is built in-app (lib/brief, daily scheduler) and written to
// BRIEF_OUT on the data volume. The legacy path is the retired host
// aggregator's output (~/services/brief/out mounted ro at /brief), kept as a
// fallback during the transition. Fixture (flagged) if neither exists.
const LEGACY_BRIEF_PATH = process.env.BRIEF_PATH || "/brief/brief.json";

export const dynamic = "force-dynamic";

function readBrief(p: string) {
  try {
    return JSON.parse(fs.readFileSync(path.resolve(p), "utf8"));
  } catch {
    return null;
  }
}

export async function GET() {
  const brief = readBrief(BRIEF_OUT) ?? readBrief(LEGACY_BRIEF_PATH);
  return NextResponse.json(
    brief ? { source: "live", brief } : { source: "fixture", brief: fixture },
    { headers: { "Cache-Control": "no-store" } }
  );
}

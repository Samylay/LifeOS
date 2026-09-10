import { NextResponse } from "next/server";
import { graphNotes, kbEnabled } from "@/lib/kb";
import { buildKnowledgeGraph } from "@/lib/knowledge-graph";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const enabled = kbEnabled();
    const { notes, totalNotes } = graphNotes();
    return NextResponse.json({ enabled, ...buildKnowledgeGraph(notes, totalNotes) });
  } catch {
    return NextResponse.json({ error: "Could not read the knowledge graph." }, { status: 500 });
  }
}

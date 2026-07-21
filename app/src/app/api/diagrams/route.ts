import { NextRequest, NextResponse } from "next/server";
import { createDoc, listDocs, deleteDoc } from "@/lib/server-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Host-side diagrams service (~/services/diagrams, systemd unit `diagrams`).
// It binds the docker bridge IP, so host.docker.internal works from the container.
const DIAGRAMS_URL = (process.env.DIAGRAMS_URL || "http://host.docker.internal:8094").replace(/\/$/, "");

const KINDS = ["auto", "flowchart", "mindmap", "sequence", "timeline"] as const;

export async function GET() {
  const diagrams = listDocs("diagrams", { orderBy: ["createdAt", "desc"], limit: 50 });
  return NextResponse.json({ diagrams });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    const kind = KINDS.includes(body.kind) ? body.kind : "auto";
    if (!prompt) return NextResponse.json({ error: "prompt is required" }, { status: 400 });

    // /compose runs claude -p sonnet then renders; typically 10-30s.
    const res = await fetch(`${DIAGRAMS_URL}/compose`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: prompt, kind }),
      signal: AbortSignal.timeout(240_000),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return NextResponse.json(
        { error: `diagrams service ${res.status}: ${detail.slice(0, 300)}` },
        { status: 502 },
      );
    }
    const { mermaid, svg } = await res.json();
    const doc = {
      title: prompt.length > 64 ? `${prompt.slice(0, 61)}…` : prompt,
      prompt,
      kind,
      mermaid,
      svg,
      createdAt: { __date: new Date().toISOString() },
    };
    const id = createDoc("diagrams", doc);
    return NextResponse.json({ diagram: { id, ...doc } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "compose failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  deleteDoc("diagrams", id);
  return NextResponse.json({ ok: true });
}

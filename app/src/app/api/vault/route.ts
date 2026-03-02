import { NextRequest, NextResponse } from "next/server";
import { readVault, readNote, searchVault, buildLifeContext } from "@/lib/vault-parser";

export async function GET(req: NextRequest) {
  // Verify the caller is authenticated
  const { verifyAuth, unauthorized } = await import("@/lib/verify-auth");
  const authResult = await verifyAuth(req);
  if (!authResult) return unauthorized();

  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action");

  // GET /api/vault?action=context → Build full life context for AI
  if (action === "context") {
    const context = buildLifeContext();
    return NextResponse.json({ context });
  }

  // GET /api/vault?action=search&q=query → Search vault notes
  if (action === "search") {
    const query = searchParams.get("q");
    if (!query) {
      return NextResponse.json({ error: "Missing ?q= parameter" }, { status: 400 });
    }
    const results = searchVault(query).slice(0, 10);
    return NextResponse.json({
      results: results.map((r) => ({
        path: r.note.path,
        title: r.note.title,
        folder: r.note.folder,
        matches: r.matches,
        score: r.score,
      })),
    });
  }

  // GET /api/vault?action=read&file=path → Read specific note
  if (action === "read") {
    const file = searchParams.get("file");
    if (!file) {
      return NextResponse.json({ error: "Missing ?file= parameter" }, { status: 400 });
    }
    const note = readNote(file);
    if (!note) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }
    return NextResponse.json({
      path: note.path,
      title: note.title,
      folder: note.folder,
      content: note.content,
      links: note.links,
      tags: note.tags,
      todos: note.todos,
    });
  }

  // GET /api/vault → List all vault notes (index)
  const notes = readVault();
  return NextResponse.json({
    notes: notes.map((n) => ({
      path: n.path,
      title: n.title,
      folder: n.folder,
      links: n.links,
      tags: n.tags,
      todoCount: n.todos.length,
      openTodos: n.todos.filter((t) => !t.done).length,
    })),
  });
}

// T-content-rework-04 — angles and questions for one idea. Never a script.
//
// The response passes through validateBrainstorm before it leaves this route,
// so a model that ignores its instructions produces a 502 rather than a
// postable draft on Samy's screen. That check is the house law of the
// redesign, and it is the reason this endpoint exists instead of the old
// /api/content/script.
import { NextRequest, NextResponse } from "next/server";
import { claudeCliEnabled, generateJson } from "@/lib/claude-cli";
import { buildBrainstormPrompt, validateBrainstorm } from "@/lib/content/brainstorm";
import type { ContentType, HookFormula } from "@/lib/content/catalog";
import { listDocs } from "@/lib/server-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!claudeCliEnabled()) {
    return NextResponse.json(
      { error: "claude-cli not enabled (set GEN_PROVIDER=claude-cli)" },
      { status: 503 },
    );
  }

  let body: { title?: unknown; body?: unknown; contentType?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 });

  // The catalog is read server-side so the prompt offers the types and hooks
  // Samy actually owns, not the constants they were seeded from.
  const types = listDocs("users/local/contentTypes", { orderBy: ["order", "asc"] }) as unknown as ContentType[];
  const hooks = listDocs("users/local/hookFormulas", { orderBy: ["n", "asc"] }) as unknown as HookFormula[];

  const prompt = buildBrainstormPrompt(
    {
      title,
      body: typeof body.body === "string" ? body.body : "",
      contentType: typeof body.contentType === "string" ? body.contentType : "",
    },
    {
      types: types.map((t) => ({ key: t.key, label: t.label })),
      hooks: hooks.map((h) => ({ n: h.n, name: h.name, template: h.template })),
    },
  );

  let raw: unknown;
  try {
    raw = await generateJson<unknown>(prompt);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "brainstorm failed" },
      { status: 500 },
    );
  }

  const checked = validateBrainstorm(raw);
  if (!checked.ok) {
    // A rejected response is a failure, not content. Nothing from it is
    // returned — not even quoted in the error.
    return NextResponse.json(
      { error: `the model returned something unusable: ${checked.reason}` },
      { status: 502 },
    );
  }

  return NextResponse.json({ brainstorm: checked.value });
}

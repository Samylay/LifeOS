import { NextResponse } from "next/server";
import { startCodexSession, getCodexSessions } from "@/lib/codex-sessions";
import { attachSession, readApp, StudioError } from "@/lib/micro/service";
import { buildGaps } from "@/lib/micro/model";
import { workspacePrompt } from "@/lib/micro/prompts";
import { body, failure } from "@/lib/micro/http";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function GET(_req: Request, context: Context) {
  try {
    const app = readApp((await context.params).id);
    return NextResponse.json({ session: app.workspaceSession ? (await getCodexSessions(app.workspaceSession))[0] : null }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return failure(error); }
}
export async function POST(req: Request, context: Context) {
  try {
    const v = await body(req); const app = readApp((await context.params).id);
    if (v.revision !== app.revision) throw new StudioError("Save the latest brief first.", 409);
    if (app.workspaceSession) {
      const existing = (await getCodexSessions(app.workspaceSession))[0];
      if (existing.status !== "failed") return NextResponse.json({ app, session: existing });
    }
    const gaps = buildGaps(app); if (gaps.length) throw new StudioError(gaps.join(" "));
    const session = await startCodexSession(`Micro: create ${app.name}`.slice(0, 160), workspacePrompt(app), `micro-workspace-${app.id}-${app.workspaceSession || "initial"}`);
    return NextResponse.json({ app: attachSession(app.id, "workspaceSession", session.id), session });
  } catch (error) { return failure(error); }
}

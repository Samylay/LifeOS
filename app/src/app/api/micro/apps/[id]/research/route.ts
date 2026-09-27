import { NextResponse } from "next/server";
import { startCodexSession, getCodexSessions } from "@/lib/codex-sessions";
import { attachSession, readApp, StudioError } from "@/lib/micro/service";
import { researchPrompt } from "@/lib/micro/prompts";
import { body, failure } from "@/lib/micro/http";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function GET(_req: Request, context: Context) {
  try {
    const app = readApp((await context.params).id);
    return NextResponse.json({ session: app.researchSession ? (await getCodexSessions(app.researchSession))[0] : null }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return failure(error); }
}
export async function POST(req: Request, context: Context) {
  try {
    const v = await body(req); const app = readApp((await context.params).id);
    if (v.revision !== app.revision) throw new StudioError("Save the latest brief first.", 409);
    if (!app.problem || !app.features.length) throw new StudioError("Describe the problem and add features first.");
    if (app.researchSession) {
      const existing = (await getCodexSessions(app.researchSession))[0];
      if (["starting", "running"].includes(existing.status)) return NextResponse.json({ app, session: existing });
    }
    const session = await startCodexSession(`Micro: research ${app.name || app.title}`.slice(0, 160), researchPrompt(app), `micro-research-${app.id}-${app.revision}-${app.researchSession || "initial"}`);
    return NextResponse.json({ app: attachSession(app.id, "researchSession", session.id), session });
  } catch (error) { return failure(error); }
}

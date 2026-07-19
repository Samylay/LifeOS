// Teaching queue + sessions: GET = everything the Teach section needs;
// POST = addTopic | schedule | start.
import { NextRequest, NextResponse } from "next/server";
import { listDocs } from "@/lib/server-db";
import { addTopic, scheduleTopic, startSession } from "@/lib/teach";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const topics = listDocs("users/local/teachTopics", { orderBy: ["createdAt", "desc"] });
  const sessions = listDocs("users/local/teachSessions", { orderBy: ["startedAt", "desc"] }).slice(0, 20);
  return NextResponse.json({ topics, sessions });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    switch (body.action) {
      case "addTopic": {
        const topic = String(body.topic || "").trim();
        if (!topic) return NextResponse.json({ error: "topic required" }, { status: 400 });
        const mission = String(body.mission || "").trim();
        if (!mission) return NextResponse.json({ error: "mission required" }, { status: 400 });
        const id = addTopic(topic, mission);
        return NextResponse.json({ id });
      }
      case "schedule": {
        const date = String(body.date || "");
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
          return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
        scheduleTopic(String(body.topicId), date);
        return NextResponse.json({ ok: true });
      }
      case "start": {
        const minutesAvailable = Number(body.minutesAvailable);
        const { sessionId, opening } = startSession(
          String(body.topicId),
          Number.isFinite(minutesAvailable) && minutesAvailable > 0 ? minutesAvailable : undefined
        );
        return NextResponse.json({ sessionId, opening: await opening });
      }
      default:
        return NextResponse.json({ error: "unknown action" }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "teach action failed" },
      { status: 500 }
    );
  }
}

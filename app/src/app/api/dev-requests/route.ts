// T29 / R-C — API for the chat-queued dev-request store. Read-only list +
// mark-done; creation happens exclusively through the chat tool (queue-only,
// no shell/file execution by design).
import { NextRequest, NextResponse } from "next/server";
import {
  completeDevRequest,
  listDevRequests,
} from "@/lib/dev-requests";

export async function GET() {
  try {
    return NextResponse.json({ requests: listDevRequests() });
  } catch {
    return NextResponse.json(
      { error: "Failed to read dev requests" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { id, action } = (await req.json()) as { id?: string; action?: string };
    if (!id || action !== "done") {
      return NextResponse.json(
        { error: "Expected { id, action: \"done\" }" },
        { status: 400 }
      );
    }
    const ok = completeDevRequest(id);
    if (!ok) {
      return NextResponse.json({ error: "Unknown request id" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Failed to update dev request" },
      { status: 500 }
    );
  }
}

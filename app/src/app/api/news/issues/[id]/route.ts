import { NextResponse } from "next/server";
import { getIssue } from "@/lib/news/issues";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const issue = getIssue(id);
  return issue ? NextResponse.json({ issue }) : NextResponse.json({ error: "Newsletter not found" }, { status: 404 });
}

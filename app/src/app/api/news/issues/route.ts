import { NextResponse } from "next/server";
import { listIssues } from "@/lib/news/issues";
export const dynamic = "force-dynamic";

export async function GET() {
  const issues = listIssues().map(({ text, ...issue }) => ({
    ...issue,
    preview: text.replace(/\s+/g, " ").slice(0, 180),
    minutes: Math.max(1, Math.ceil(text.split(/\s+/).length / 220)),
  }));
  return NextResponse.json({ issues });
}

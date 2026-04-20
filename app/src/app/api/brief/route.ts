import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";

const SYSTEM_PROMPT = `You are "Stride AI", a personal productivity coach. 
Your job is to provide a "Daily Brief" — a very concise (2-3 sentences), motivating summary of the user's day based on their data.

Focus on:
- Highlighting urgent/high priority tasks.
- Mentioning key calendar events.
- Encouraging habit consistency.
- Keeping it professional yet punchy and personal.

Rules:
- Max 3 sentences.
- No conversational filler (like "Here is your brief").
- Use a supportive, senior-engineer-to-peer tone.`;

export async function POST(req: NextRequest) {
  const { verifyAuth, unauthorized } = await import("@/lib/verify-auth");
  const authResult = await verifyAuth(req);
  if (!authResult) return unauthorized();

  try {
    const { tasks, events, habits, stats } = await req.json();

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY not configured" },
        { status: 500 }
      );
    }

    const client = new OpenAI({
      apiKey,
      baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    });

    const context = `
Tasks: ${tasks.map((t: any) => `${t.title} (${t.priority})`).join(", ")}
Events: ${events.map((e: any) => e.title).join(", ")}
Habits Done: ${stats.habitsDone}/${stats.totalHabits}
Focus today: ${stats.focusMinutes} minutes
`;

    const response = await client.chat.completions.create({
      model: "gemini-2.0-flash",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Generate my daily brief based on this: ${context}` },
      ],
      max_tokens: 150,
    });

    const brief = response.choices[0].message.content;
    return NextResponse.json({ brief });
  } catch (error: any) {
    console.error("Brief API error:", error);
    return NextResponse.json(
      { error: "Failed to generate brief", details: error.message },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getOllamaClient, OLLAMA_MODEL } from "@/lib/ollama";

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
  try {
    const { tasks, events, stats } = await req.json();

    const client = getOllamaClient();

    const context = `
Tasks: ${tasks.map((t: any) => `${t.title} (${t.priority})`).join(", ")}
Events: ${events.map((e: any) => e.title).join(", ")}
Habits Done: ${stats.habitsDone}/${stats.totalHabits}
`;

    const response = await client.chat.completions.create({
      model: OLLAMA_MODEL,
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
      { error: "Failed to generate brief. Is Ollama running?", details: error.message },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getOllamaClient, OLLAMA_MODEL } from "@/lib/ollama";
import { claudeCliEnabled, generateJson } from "@/lib/claude-cli";

const SYSTEM_PROMPT = `You are a high-precision productivity data extractor for Stride, a personal productivity app.
Your goal is to parse natural language "quick capture" text into structured data.

Input: A string of text representing a task, event, note, or reminder.
Output: A JSON object with the following schema:
{
  "type": "task" | "event" | "note" | "reminder",
  "confidence": number, // 0 to 1
  "fields": {
    // for tasks
    "title"?: string,
    "priority"?: "low" | "medium" | "high" | "urgent",
    "area"?: "health" | "career" | "finance" | "brand" | "admin",
    "dueDate"?: string, // ISO YYYY-MM-DD
    "energy"?: 1 | 2 | 3,
    "estimatedMinutes"?: number,

    // for events
    "start"?: string, // ISO datetime
    "end"?: string, // ISO datetime

    // for notes
    "content"?: string,
    "tags"?: string[],

    // for reminders
    "frequency"?: "once" | "daily" | "weekly" | "monthly" | "yearly",
    "time"?: string // HH:mm
  }
}

Guidelines:
- If it's clearly a to-do with a verb, type is "task".
- If it has a specific time or "meeting with", type is "event".
- If it's a recurring check or "every day", type is "reminder" (or "habit", but use "reminder" for now as per schema).
- If it's just information or a "thought", type is "note".
- Infer "area" from keywords (gym/run -> health, meeting/work/study -> career, bill/bank -> finance, post/video -> brand, call mom/fix sink -> admin).
- Infer "energy" (1=low/admin, 2=medium/normal, 3=deep focus/creative).
- Set confidence < 0.5 if the text is too vague or doesn't fit a type well.
- Always return VALID JSON. Do not include any other text.`;

export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json();

    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "Missing text input" }, { status: 400 });
    }

    if (claudeCliEnabled()) {
      const parsed = await generateJson(
        `${SYSTEM_PROMPT}\n\nParse this: "${text}"`
      );
      return NextResponse.json(parsed);
    }

    const client = getOllamaClient();

    const response = await client.chat.completions.create({
      model: OLLAMA_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Parse this: "${text}"` },
      ],
      response_format: { type: "json_object" },
      max_tokens: 1024,
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error("Empty response from AI");
    }

    const parsed = JSON.parse(content);
    return NextResponse.json(parsed);
  } catch (error: any) {
    console.error("Parse API error:", error);
    return NextResponse.json(
      { error: "Failed to parse text. Check the Claude CLI (or Ollama if GEN_PROVIDER=ollama).", details: error.message },
      { status: 500 }
    );
  }
}

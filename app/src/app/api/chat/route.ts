import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";

const SYSTEM_PROMPT = `You are a helpful assistant embedded inside Stride, a personal productivity app built by and for Samy Layaida.

## About Samy
- EPITA student (Software Engineering) based in Paris
- Junior Full Stack Developer, intern at Ouidou Consulting
- Member of JECT (Junior Enterprise) — handles dev, ops, and client relations
- Passionate about AI, cybersecurity, reverse engineering, and web development
- Triathlon enthusiast (swimming focus in Q1 2026), pursuing bodyweight skills (handstands, pistol squats, one-arm pushups)
- Building a personal brand and mailing list around tech content (Instagram, YouTube, LinkedIn)
- Uses Obsidian as a knowledge base alongside Stride for daily operations

## Samy's 2026 Goals
1. Build personal brand & mailing list (content creation + audience)
2. Excel at JECT — master client relations, project scoping, sales
3. Level up technical skills: cybersecurity, AI systems, reverse engineering
4. Triathlon training consistency + bodyweight skill goals
5. Get financially organized (budgeting, financial literacy)
6. Compartmentalize life areas (work, school, JECT, triathlon, personal)

## Your Role
You are Samy's personal chief of staff inside Stride. You know his goals, areas of focus, and priorities. When he pastes raw text (e.g. from Notion, notes, or brain dumps), extract actionable items from it. Use the tools to create items in the app.

Guidelines:
- Extract clear, actionable tasks from unstructured text
- Infer priority from context (words like "urgent", "ASAP", "this week" → high/urgent; general items → medium; "someday", "maybe" → low)
- Infer the area when possible: "health" for fitness/wellness/training, "career" for work/JECT/learning/EPITA, "finance" for money/budgeting, "brand" for personal brand/content creation, "admin" for logistics/bureaucracy
- Group related items into projects when appropriate
- For recurring activities, create habits instead of tasks
- For time-sensitive items with deadlines, create reminders
- Keep task titles concise and actionable (start with a verb)
- You can also answer questions about productivity, help organize thoughts, or have a normal conversation
- When creating many items, use the batch create_tasks tool to create them efficiently
- After creating items, give the user a summary of what you added
- Address Samy by name when appropriate — this is his personal app, not a generic tool
- When suggesting priorities or scheduling, consider his student schedule, intern commitments, JECT obligations, and training goals

The user's existing data context will be provided when available so you can avoid duplicates.`;

const tools: OpenAI.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "create_tasks",
      description:
        "Create one or more tasks in the app. Use this for actionable to-do items. You can create multiple tasks at once.",
      parameters: {
        type: "object",
        properties: {
          tasks: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: {
                  type: "string",
                  description: "Short, actionable task title (start with a verb)",
                },
                priority: {
                  type: "string",
                  enum: ["low", "medium", "high", "urgent"],
                  description: "Task priority level",
                },
                area: {
                  type: "string",
                  enum: ["health", "career", "finance", "brand", "admin"],
                  description: "Life area this task belongs to (optional)",
                },
                dueDate: {
                  type: "string",
                  description:
                    "Due date in ISO format YYYY-MM-DD (optional, only if a clear deadline exists)",
                },
              },
              required: ["title", "priority"],
            },
            description: "Array of tasks to create",
          },
        },
        required: ["tasks"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_goal",
      description:
        "Create a goal. Goals are high-level objectives for the year, optionally scoped to a quarter.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Goal title" },
          year: { type: "number", description: "Target year (e.g. 2026)" },
          quarter: {
            type: "number",
            enum: [1, 2, 3, 4],
            description: "Target quarter (optional)",
          },
        },
        required: ["title", "year"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_habit",
      description:
        "Create a habit to track. Habits are recurring activities the user wants to build consistency with.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Habit name" },
          frequency: {
            type: "string",
            enum: ["daily", "weekly"],
            description: "How often the habit should be done",
          },
          area: {
            type: "string",
            enum: ["health", "career", "finance", "brand", "admin"],
            description: "Life area (optional)",
          },
        },
        required: ["name", "frequency"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_note",
      description:
        "Capture a note or piece of information that doesn't fit as a task. Good for ideas, references, and things to process later.",
      parameters: {
        type: "object",
        properties: {
          content: { type: "string", description: "Note content" },
          tags: {
            type: "array",
            items: { type: "string" },
            description: "Tags for categorization",
          },
          area: {
            type: "string",
            enum: ["health", "career", "finance", "brand", "admin"],
            description: "Life area (optional)",
          },
        },
        required: ["content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_reminder",
      description:
        "Create a reminder for something due at a specific time or date, optionally recurring.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Reminder title" },
          frequency: {
            type: "string",
            enum: ["once", "daily", "weekly", "monthly", "yearly"],
          },
          dueDate: {
            type: "string",
            description: "Due date in ISO format YYYY-MM-DD",
          },
          time: {
            type: "string",
            description: "Time in HH:mm format (optional)",
          },
          area: {
            type: "string",
            enum: ["health", "career", "finance", "brand", "admin"],
            description: "Life area (optional)",
          },
        },
        required: ["title", "frequency", "dueDate"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_project",
      description:
        "Create a project. Projects group related tasks and have a status lifecycle (planning → active → completed).",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Project title" },
          area: {
            type: "string",
            enum: ["health", "career", "finance", "brand", "admin"],
            description: "Life area (optional)",
          },
          status: {
            type: "string",
            enum: ["planning", "active", "paused"],
            description: "Initial project status",
          },
        },
        required: ["title"],
      },
    },
  },
];

export interface ChatAction {
  tool: string;
  input: Record<string, unknown>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function callWithRetry(
  client: OpenAI,
  params: OpenAI.ChatCompletionCreateParamsNonStreaming,
  maxRetries = 3
): Promise<OpenAI.ChatCompletion> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await client.chat.completions.create(params);
    } catch (err: unknown) {
      const status =
        err != null && typeof err === "object" && "status" in err
          ? (err as { status: number }).status
          : undefined;
      if (status === 429 && attempt < maxRetries) {
        const delay = Math.pow(2, attempt + 1) * 1000; // 2s, 4s, 8s
        console.log(`Gemini rate limited, retrying in ${delay / 1000}s...`);
        await sleep(delay);
        continue;
      }
      throw err;
    }
  }
}

export async function POST(req: NextRequest) {
  try {
    const { messages, context } = await req.json();

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY not configured. Add it to your .env.local file." },
        { status: 500 }
      );
    }

    const client = new OpenAI({
      apiKey,
      baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    });

    // Build system prompt with context
    let systemPrompt = SYSTEM_PROMPT;
    if (context) {
      systemPrompt += "\n\n## Current App State\n";
      if (context.taskCount !== undefined) {
        systemPrompt += `- Total tasks: ${context.taskCount}\n`;
      }
      if (context.existingTasks?.length) {
        systemPrompt += `- Existing task titles: ${context.existingTasks.join(", ")}\n`;
      }
      if (context.existingGoals?.length) {
        systemPrompt += `- Existing goals: ${context.existingGoals.join(", ")}\n`;
      }
      if (context.existingHabits?.length) {
        systemPrompt += `- Existing habits: ${context.existingHabits.join(", ")}\n`;
      }
      if (context.existingProjects?.length) {
        systemPrompt += `- Existing projects: ${context.existingProjects.join(", ")}\n`;
      }
      systemPrompt += `\nToday's date: ${new Date().toISOString().split("T")[0]}\n`;
      systemPrompt += `Avoid creating duplicates of existing items.`;
    }

    // Convert messages to API format
    const openaiMessages: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      ...messages.map((m: { role: string; content: string }) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    ];

    const actions: ChatAction[] = [];
    let reply = "";

    // Call Gemini and handle tool use loop
    let response = await callWithRetry(client, {
      model: "gemini-2.0-flash",
      max_tokens: 4096,
      tools,
      messages: openaiMessages,
    });

    let choice = response.choices[0];
    let iterations = 0;
    const MAX_ITERATIONS = 10;

    while (
      choice.finish_reason === "tool_calls" &&
      choice.message.tool_calls?.length &&
      iterations < MAX_ITERATIONS
    ) {
      iterations++;

      // Add the assistant message with tool calls
      openaiMessages.push(choice.message);

      // Process each tool call
      for (const toolCall of choice.message.tool_calls) {
        if (toolCall.type !== "function") continue;
        const fn = toolCall.function;
        const parsedArgs = JSON.parse(fn.arguments);
        actions.push({ tool: fn.name, input: parsedArgs });

        // Add tool result
        openaiMessages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify({ success: true }),
        });
      }

      // Continue conversation
      response = await callWithRetry(client, {
        model: "gemini-2.0-flash",
        max_tokens: 4096,
        tools,
        messages: openaiMessages,
      });

      choice = response.choices[0];
    }

    // Extract final text
    reply += choice.message.content || "";

    return NextResponse.json({ reply, actions });
  } catch (error: unknown) {
    console.error("Chat API error:", error);

    // Detect API error status codes
    const status =
      error != null && typeof error === "object" && "status" in error
        ? (error as { status: number }).status
        : undefined;

    if (status === 429) {
      return NextResponse.json(
        {
          error: "quota_exceeded",
          message:
            "Your Gemini API rate limit has been exceeded. The free tier allows 15 requests/minute. Please wait a moment and try again.",
        },
        { status: 429 }
      );
    }

    if (status === 401) {
      return NextResponse.json(
        {
          error: "invalid_api_key",
          message:
            "Your Gemini API key is invalid or expired. Update GEMINI_API_KEY in your .env.local file.",
        },
        { status: 401 }
      );
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: "server_error", message }, { status: 500 });
  }
}

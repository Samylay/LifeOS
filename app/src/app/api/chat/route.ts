import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

const SYSTEM_PROMPT = `You are a helpful assistant embedded inside LifeOS, a personal productivity app. The user may paste raw text (e.g. from Notion, notes, or brain dumps) and you should extract actionable items from it.

You have access to tools that let you create items in the app. When the user pastes content, analyze it and use the appropriate tools to create tasks, goals, habits, notes, reminders, or projects.

Guidelines:
- Extract clear, actionable tasks from unstructured text
- Infer priority from context (words like "urgent", "ASAP", "this week" → high/urgent; general items → medium; "someday", "maybe" → low)
- Infer the area when possible: "health" for fitness/wellness, "career" for work/learning, "finance" for money, "brand" for personal brand/content, "admin" for logistics/bureaucracy
- Group related items into projects when appropriate
- For recurring activities, create habits instead of tasks
- For time-sensitive items with deadlines, create reminders
- Keep task titles concise and actionable (start with a verb)
- You can also answer questions about productivity, help organize thoughts, or have a normal conversation
- When creating many items, use the batch create_tasks tool to create them efficiently
- After creating items, give the user a summary of what you added

The user's existing data context will be provided when available so you can avoid duplicates.`;

const tools: Anthropic.Tool[] = [
  {
    name: "create_tasks",
    description:
      "Create one or more tasks in the app. Use this for actionable to-do items. You can create multiple tasks at once.",
    input_schema: {
      type: "object" as const,
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
  {
    name: "create_goal",
    description:
      "Create a goal. Goals are high-level objectives for the year, optionally scoped to a quarter.",
    input_schema: {
      type: "object" as const,
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
  {
    name: "create_habit",
    description:
      "Create a habit to track. Habits are recurring activities the user wants to build consistency with.",
    input_schema: {
      type: "object" as const,
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
  {
    name: "create_note",
    description:
      "Capture a note or piece of information that doesn't fit as a task. Good for ideas, references, and things to process later.",
    input_schema: {
      type: "object" as const,
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
  {
    name: "create_reminder",
    description:
      "Create a reminder for something due at a specific time or date, optionally recurring.",
    input_schema: {
      type: "object" as const,
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
  {
    name: "create_project",
    description:
      "Create a project. Projects group related tasks and have a status lifecycle (planning → active → completed).",
    input_schema: {
      type: "object" as const,
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
];

export interface ChatAction {
  tool: string;
  input: Record<string, unknown>;
}

export async function POST(req: NextRequest) {
  try {
    const { messages, context } = await req.json();

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY not configured. Add it to your .env.local file." },
        { status: 500 }
      );
    }

    const client = new Anthropic({ apiKey });

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

    // Convert messages to Anthropic format
    const anthropicMessages: Anthropic.MessageParam[] = messages.map(
      (m: { role: string; content: string }) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })
    );

    const actions: ChatAction[] = [];
    let reply = "";

    // Call Claude and handle tool use loop
    let response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: systemPrompt,
      tools,
      messages: anthropicMessages,
    });

    // Loop while Claude wants to use tools
    const conversationMessages = [...anthropicMessages];
    let iterations = 0;
    const MAX_ITERATIONS = 10;

    while (response.stop_reason === "tool_use" && iterations < MAX_ITERATIONS) {
      iterations++;

      // Collect tool uses and build results
      const assistantContent = response.content;
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of assistantContent) {
        if (block.type === "text") {
          reply += block.text;
        }
        if (block.type === "tool_use") {
          actions.push({ tool: block.name, input: block.input as Record<string, unknown> });
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: JSON.stringify({ success: true }),
          });
        }
      }

      // Continue conversation with tool results
      conversationMessages.push({ role: "assistant", content: assistantContent });
      conversationMessages.push({ role: "user", content: toolResults });

      response = await client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        system: systemPrompt,
        tools,
        messages: conversationMessages,
      });
    }

    // Extract final text
    for (const block of response.content) {
      if (block.type === "text") {
        reply += block.text;
      }
    }

    return NextResponse.json({ reply, actions });
  } catch (error: unknown) {
    console.error("Chat API error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

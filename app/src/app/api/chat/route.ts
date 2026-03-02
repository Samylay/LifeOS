import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";
import { buildLifeContext, searchVault, readNote } from "@/lib/vault-parser";

const SYSTEM_PROMPT = `You are the AI brain of Stride — a personal life operating system. You are not a generic assistant. You know this person's life because you have access to their Obsidian vault (their second brain) and their live app data.

Your role is **personal chief of staff**: you process information, surface what's relevant, give grounded advice, and help execute. You don't wait to be asked — you notice patterns and flag them.

## Your Personality
- Direct, concise, no fluff. Like a sharp cofounder who knows the context.
- You reference their actual goals, projects, and training data — not generic advice.
- You understand their values: halal diet, privacy-first tech, sustainability, iron-sharpens-iron mentality.
- You know they're a triathlete, EPITA student, JECT member, and aspiring content creator.
- You speak in their language — mixing English and French is normal.

## What You Can Do
- **Create & manage items** in the app (tasks, goals, habits, notes, reminders, projects)
- **Search their Obsidian vault** to find notes, goals, project details, or any knowledge they've written down
- **Read specific vault notes** to get full context on a topic
- **Give contextual advice** based on their training plan, JECT projects, school deadlines, and goals
- **Morning briefings**: summarize the day ahead, suggest priorities based on goals + schedule + energy
- **Evening reviews**: reflect on what got done, flag missed items, suggest tomorrow's focus
- **Nutrition guidance**: high protein, halal, training-load-aware meal ideas
- **Training awareness**: know their triathlon training (swimming focus Q1), bodyweight skill goals, recovery needs

## Guidelines
- When creating items, infer priority from context and assign the right life area
- Reference their actual vault notes when giving advice — be specific
- Use the search_vault tool when you need to look up something from their knowledge base
- Use the read_vault_note tool to get the full content of a specific note
- When they paste raw text, extract actionable items and create them efficiently
- After creating items, give a summary of what you added
- Don't create duplicates of existing items
- Keep task titles concise and actionable (start with a verb)
- For recurring activities, create habits instead of tasks
- For time-sensitive items with deadlines, create reminders`;

const tools: OpenAI.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "search_vault",
      description:
        "Search the user's Obsidian vault (their second brain / knowledge base) for notes matching a query. Use this to find context about their goals, projects, training plans, ideas, or any topic they've written about. Returns matching note titles and relevant excerpts.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "Search query — can be a topic, keyword, project name, or concept. Examples: 'triathlon training', 'JECT clients', 'bodyweight skills', 'GrapheneOS'",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_vault_note",
      description:
        "Read the full content of a specific note from the Obsidian vault. Use this when you need detailed context from a note found via search_vault, or when you know the exact note path.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description:
              "Relative path of the note in the vault, e.g. '03-Projects/JECT.md', '04-Goals/Goals-2026.md', '05-Areas/Health.md'",
          },
        },
        required: ["path"],
      },
    },
  },
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

/** Handle vault tool calls server-side (these don't create data, just read) */
function handleVaultTool(
  name: string,
  args: Record<string, unknown>
): string {
  if (name === "search_vault") {
    const query = args.query as string;
    const results = searchVault(query).slice(0, 8);
    if (results.length === 0) {
      return JSON.stringify({ results: [], message: "No matching notes found." });
    }
    return JSON.stringify({
      results: results.map((r) => ({
        path: r.note.path,
        title: r.note.title,
        folder: r.note.folder,
        excerpts: r.matches.slice(0, 3),
        score: r.score,
      })),
    });
  }

  if (name === "read_vault_note") {
    const filePath = args.path as string;
    const note = readNote(filePath);
    if (!note) {
      return JSON.stringify({ error: `Note not found: ${filePath}` });
    }
    // Truncate very long notes to avoid token bloat
    const maxLen = 3000;
    const content =
      note.content.length > maxLen
        ? note.content.slice(0, maxLen) + "\n\n[... truncated]"
        : note.content;
    return JSON.stringify({
      path: note.path,
      title: note.title,
      content,
      links: note.links,
      todos: note.todos.slice(0, 20),
    });
  }

  return JSON.stringify({ error: "Unknown vault tool" });
}

const VAULT_TOOLS = new Set(["search_vault", "read_vault_note"]);

export async function POST(req: NextRequest) {
  // Verify the caller is authenticated before processing
  const { verifyAuth, unauthorized } = await import("@/lib/verify-auth");
  const authResult = await verifyAuth(req);
  if (!authResult) return unauthorized();

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

    // Build system prompt with vault context + app state
    let systemPrompt = SYSTEM_PROMPT;

    // Inject live vault context (goals, projects, areas, inbox)
    try {
      const vaultContext = buildLifeContext();
      if (vaultContext) {
        systemPrompt += `\n\n# Your Life Context (from Obsidian vault)\n\n${vaultContext}`;
      }
    } catch (err) {
      console.warn("Could not load vault context:", err);
    }

    // Inject app state context
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
    }

    systemPrompt += `\nToday's date: ${new Date().toISOString().split("T")[0]}`;
    systemPrompt += `\nAvoid creating duplicates of existing items.`;

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

        if (VAULT_TOOLS.has(fn.name)) {
          // Vault tools are handled server-side — return real data to the LLM
          const result = handleVaultTool(fn.name, parsedArgs);
          openaiMessages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: result,
          });
        } else {
          // App mutation tools — collect for client-side execution
          actions.push({ tool: fn.name, input: parsedArgs });
          openaiMessages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify({ success: true }),
          });
        }
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

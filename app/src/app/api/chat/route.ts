import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";
import { getOllamaClient, OLLAMA_MODEL } from "@/lib/ollama";

const SYSTEM_PROMPT = `You are a helpful assistant embedded inside Stride, a personal productivity app. The user is a triathlete, developer, and business manager — fueling and nutrition logistics matter for his training, but this app does NOT track calories or macros, only groceries/recipes/meal planning. The user may paste raw text (e.g. from Notion, notes, or brain dumps) and you should extract actionable items from it. He may also speak commands via voice — voice transcripts can be short and imperative (e.g. "add eggs and oats to the grocery list", "mark laundry done", "plan chicken stir fry for dinner Wednesday").

You have access to tools that let you create items in the app. When the user pastes content, analyze it and use the appropriate tools to create tasks, goals, habits, notes, reminders, projects, shopping items, recipes, or meal plan entries — and to mark tasks complete.

Guidelines:
- Extract clear, actionable tasks from unstructured text
- Infer priority from context (words like "urgent", "ASAP", "this week" → high/urgent; general items → medium; "someday", "maybe" → low)
- Infer the area when possible: "health" for fitness/wellness, "career" for work/learning, "finance" for money, "brand" for personal brand/content, "admin" for logistics/bureaucracy
- Group related items into projects when appropriate
- For recurring activities, create habits instead of tasks
- For time-sensitive items with deadlines, create reminders
- Keep task titles concise and actionable (start with a verb)
- For grocery/food requests ("add X to the shopping list", "we need more Y"), use add_shopping_items
- For recipe requests ("save this recipe", "remember how to make X"), use create_recipe
- For meal planning ("plan X for dinner Tuesday", "lunch tomorrow is leftovers"), use plan_meal — map relative days (today/tomorrow/this week) to mon..sun
- For "mark X done", "I finished X", "complete the X task", use complete_task to fuzzy-match an existing task
- You can also answer questions about productivity, fueling/grocery logistics, or have a normal conversation
- When creating many items, use the batch create_tasks tool to create them efficiently
- After creating items, give the user a brief summary of what you added

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
  {
    type: "function",
    function: {
      name: "add_shopping_items",
      description:
        "Add one or more items to the grocery/shopping list. Use this for any 'add X to the list', 'we need Y', or fueling/grocery requests.",
      parameters: {
        type: "object",
        properties: {
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string", description: "Item name" },
                quantity: {
                  type: "string",
                  description: "Quantity, e.g. '2', '1 lb', '6-pack' (optional)",
                },
                category: {
                  type: "string",
                  enum: ["groceries", "household", "personal_care", "snacks", "beverages", "frozen", "other"],
                  description: "Shopping category (optional, defaults to groceries)",
                },
              },
              required: ["name"],
            },
            description: "Array of items to add to the shopping list",
          },
        },
        required: ["items"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_recipe",
      description:
        "Save a recipe with its ingredients and optional steps, so it can be planned into the weekly meal plan and its ingredients added to the shopping list later.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Recipe name" },
          ingredients: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string", description: "Ingredient name" },
                quantity: { type: "string", description: "Quantity (optional)" },
                category: {
                  type: "string",
                  enum: ["groceries", "household", "personal_care", "snacks", "beverages", "frozen", "other"],
                  description: "Shopping category (optional, defaults to groceries)",
                },
              },
              required: ["name"],
            },
            description: "Ingredients needed for the recipe",
          },
          steps: {
            type: "array",
            items: { type: "string" },
            description: "Preparation steps, in order (optional)",
          },
        },
        required: ["name", "ingredients"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "plan_meal",
      description:
        "Assign a recipe or free-text meal to a day and slot in the weekly meal plan.",
      parameters: {
        type: "object",
        properties: {
          day: {
            type: "string",
            enum: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
            description: "Day of the week",
          },
          slot: {
            type: "string",
            enum: ["lunch", "dinner"],
            description: "Meal slot",
          },
          recipe_name: {
            type: "string",
            description: "Name of an existing recipe to plan (matched by name, optional)",
          },
          text: {
            type: "string",
            description: "Free-text meal description if no recipe applies (optional)",
          },
        },
        required: ["day", "slot"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "complete_task",
      description:
        "Mark an existing open task as done, fuzzy-matching by title.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Title or partial title of the task to complete" },
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

    const client = getOllamaClient();

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

    // Call the local model and handle the tool-use loop
    let response = await callWithRetry(client, {
      model: OLLAMA_MODEL,
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
        model: OLLAMA_MODEL,
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

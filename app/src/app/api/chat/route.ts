import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";
import { getOllamaClient, OLLAMA_MODEL } from "@/lib/ollama";
import { claudeCliEnabled, generateJson } from "@/lib/claude-cli";
import {
  HOMELAB_TOOLS,
  HOMELAB_TOOL_NAMES,
  HOMELAB_TOOL_STATUS,
  executeHomelabTool,
  type HomelabToolResult,
} from "@/lib/homelab-tools";
import { executeAppActions } from "@/lib/app-actions";
import { logChatMessage } from "@/lib/chat-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYSTEM_PROMPT = `You are a helpful assistant embedded inside LifeOS, a personal productivity app. The user is a triathlete, developer, and business manager. The user may paste raw text (e.g. from Notion, notes, or brain dumps) and you should extract actionable items from it. He may also speak commands via voice — voice transcripts can be short and imperative (e.g. "mark laundry done", "remind me to call the landlord Friday").

You have access to tools that let you create items in the app. When the user pastes content, analyze it and use the appropriate tools to create tasks, habits, notes, reminders, or projects — and to mark tasks complete.

You are ALSO a homelab surface. Through homelab tools (executed server-side, results returned to you) you can: see everything queued or pending across the decide system ("the approve page"), launch the queued prompts as a Claude Code session on the homelab, queue new ad-hoc work for a Claude session, check live service health and host vitals, read the last nightly autoloop run, list or rule on pending NEEDS-SAMY approval cards, and add topics to his teaching queue (add_learning_topic — use it whenever he says he wants to learn or go deep on something; voice teaching sessions live in the Teach me section on /knowledge). When asked what you can do, include these. You can NOT run shell commands, restart services, or edit files directly — acting on the homelab always goes through the queued-session pipeline, and approval verdicts only record the ruling (the nightly pass writes it back; nothing executes automatically). If a homelab request doesn't fit these tools, say which part you can't do instead of denying everything.

Guidelines:
- Extract clear, actionable tasks from unstructured text
- Infer priority from context (words like "urgent", "ASAP", "this week" → high/urgent; general items → medium; "someday", "maybe" → low)
- Infer the area when possible: "health" for fitness/wellness, "career" for work/learning, "finance" for money, "brand" for personal brand/content, "admin" for logistics/bureaucracy
- Group related items into projects when appropriate
- For recurring activities, create habits instead of tasks
- For time-sensitive items with deadlines, create reminders
- Keep task titles concise and actionable (start with a verb)
- For "mark X done", "I finished X", "complete the X task", use complete_task to fuzzy-match an existing task
- You can also answer questions about productivity or have a normal conversation
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
    const { messages, context, sessionId: rawSessionId } = await req.json();
    // T45: every exchange is persisted server-side as it happens, keyed by a
    // client-generated conversation id (fallback keeps logging even for old
    // clients that don't send one — each request becomes its own session).
    const sessionId: string =
      typeof rawSessionId === "string" && rawSessionId ? rawSessionId : `anon-${Date.now()}`;
    const lastMsg = Array.isArray(messages) ? messages[messages.length - 1] : null;
    if (lastMsg?.role === "user" && typeof lastMsg.content === "string") {
      logChatMessage(sessionId, "user", lastMsg.content);
    }

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
      if (context.existingHabits?.length) {
        systemPrompt += `- Existing habits: ${context.existingHabits.join(", ")}\n`;
      }
      if (context.existingProjects?.length) {
        systemPrompt += `- Existing projects: ${context.existingProjects.join(", ")}\n`;
      }
      systemPrompt += `\nToday's date: ${new Date().toISOString().split("T")[0]}\n`;
      systemPrompt += `Avoid creating duplicates of existing items.`;
    }

    // Claude Code CLI path: `claude -p` has no native OpenAI-style function
    // calling, so we describe the tool catalog in the prompt and ask Claude to
    // return a { reply, actions } envelope. Since T45 app-item actions are
    // executed server-side (app-actions.ts) and the client only receives
    // their results — `actions` in the final payload is always empty.
    //
    // Homelab tools are executed HERE (server-side) in a bounded loop: each
    // round's results are appended to the conversation and Claude is called
    // again, so it can answer from real data ("what's queued?") or chain a
    // check before an action. The response is NDJSON: {type:"status"} lines
    // stream tool activity to the panel, then one {type:"final"} payload.
    if (claudeCliEnabled()) {
      const toolCatalog = [
        ...tools
          .filter((t): t is OpenAI.ChatCompletionFunctionTool => t.type === "function")
          .map((t) => t.function),
        ...HOMELAB_TOOLS,
      ];
      const convoParts: string[] = messages.map(
        (m: { role: string; content: string }) => `${m.role.toUpperCase()}: ${m.content}`
      );

      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          const emit = (obj: unknown) =>
            controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
          try {
            const serverResults: HomelabToolResult[] = [];
            let reply = "";
            let clientActions: ChatAction[] = [];
            const MAX_ROUNDS = 4;

            for (let round = 0; round < MAX_ROUNDS; round++) {
              const prompt = [
                systemPrompt,
                "",
                "You can act by emitting tool calls. Available tools (JSON schema):",
                JSON.stringify(toolCatalog, null, 2),
                "",
                `Homelab tools (${[...HOMELAB_TOOL_NAMES].join(", ")}) are executed by the server and their results are appended to the conversation as TOOL_RESULT lines — call them and WAIT for results before answering about homelab state or emitting app-item actions. App-item tools (create_tasks, create_habit, create_note, create_reminder, create_project, complete_task) are executed by the server from your FINAL response — only emit them in a response that contains no homelab tool calls, and never repeat ones you already emitted.`,
                "",
                "Conversation so far:",
                convoParts.join("\n\n"),
                "",
                "Respond with ONLY a JSON object of this exact shape — no markdown, no prose outside it:",
                `{"reply": "<short natural-language summary for the user>", "actions": [{"tool": "<tool name>", "input": { ...args matching that tool's schema }}]}`,
                "Put every action you want to take in `actions`. If no tool is needed (a question or normal chat), return an empty `actions` array and put your full answer in `reply`.",
              ].join("\n");

              const envelope = await generateJson<{ reply?: string; actions?: ChatAction[] }>(prompt);
              reply = typeof envelope.reply === "string" ? envelope.reply : "";
              const actions = Array.isArray(envelope.actions) ? envelope.actions : [];
              const homelabCalls = actions.filter((a) => HOMELAB_TOOL_NAMES.has(a.tool));
              clientActions = actions.filter((a) => !HOMELAB_TOOL_NAMES.has(a.tool));

              if (homelabCalls.length === 0 || round === MAX_ROUNDS - 1) break;

              convoParts.push(`ASSISTANT (tool calls): ${JSON.stringify(homelabCalls)}`);
              for (const call of homelabCalls) {
                emit({ type: "status", text: HOMELAB_TOOL_STATUS[call.tool] ?? `Running ${call.tool}…` });
                const result = await executeHomelabTool(call.tool, call.input ?? {});
                serverResults.push(result);
                // Tool results are part of the conversation record — a
                // service-health snapshot or approvals brief fetched into the
                // chat must survive the tab (loss-audit F1).
                logChatMessage(sessionId, "tool", JSON.stringify(result.data).slice(0, 8000), [
                  { tool: result.tool, summary: result.summary, failed: result.failed },
                ]);
                convoParts.push(
                  `TOOL_RESULT (${result.tool}${result.failed ? ", FAILED" : ""}): ${JSON.stringify(result.data)}`
                );
              }
              emit({ type: "status", text: "Thinking…" });
            }

            // T45: app-item actions commit HERE, before the reply reaches the
            // client — closing the tab can no longer drop what the model
            // decided to create. The client receives them as results only.
            const appResults = clientActions.length ? await executeAppActions(clientActions) : [];
            const allResults = [
              ...serverResults.map(({ tool, summary, failed }) => ({ tool, summary, failed })),
              ...appResults,
            ];
            logChatMessage(sessionId, "assistant", reply, allResults);

            emit({
              type: "final",
              reply,
              actions: [],
              serverResults: allResults,
            });
          } catch (err) {
            emit({
              type: "error",
              message: err instanceof Error ? err.message : "Unknown error",
            });
          } finally {
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: { "Content-Type": "application/x-ndjson; charset=utf-8" },
      });
    }

    // ── Ollama fallback: native OpenAI-style tool-calling loop ────────────────
    const client = getOllamaClient();

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

    // T45: same server-side commit + logging contract as the claude path.
    const appResults = actions.length ? await executeAppActions(actions) : [];
    logChatMessage(sessionId, "assistant", reply, appResults);

    return NextResponse.json({ reply, actions: [], serverResults: appResults });
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

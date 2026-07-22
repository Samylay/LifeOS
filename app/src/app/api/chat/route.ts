import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";
import { getOllamaClient, OLLAMA_MODEL } from "@/lib/ollama";
import { claudeCliEnabled } from "@/lib/claude-cli";
import { APP_TOOLS, runAgentTurn, type AgentAction } from "@/lib/agent-engine";
import { executeAppActions } from "@/lib/app-actions";
import { logChatMessage } from "@/lib/chat-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYSTEM_PROMPT = `You are a helpful assistant embedded inside LifeOS, a personal productivity app. The user is a triathlete, developer, and business manager. The user may paste raw text (e.g. from Notion, notes, or brain dumps) and you should extract actionable items from it. He may also speak commands via voice — voice transcripts can be short and imperative (e.g. "mark laundry done", "remind me to call the landlord Friday").

You have access to tools that let you create items in the app. When the user pastes content, analyze it and use the appropriate tools to create tasks, habits, notes, reminders, or projects — and to mark tasks complete.

You are ALSO a homelab surface. Through homelab tools (executed server-side, results returned to you) you can: see everything queued or pending across the decide system ("the approve page"), launch the queued prompts as a Claude Code session on the homelab, queue new ad-hoc work for a Claude session, check live service health and host vitals, read the last nightly autoloop run, list or rule on pending NEEDS-SAMY approval cards, and add topics to his teaching queue (add_learning_topic — use it whenever he says he wants to learn or go deep on something; voice teaching sessions live in the Teach me section on /knowledge). When asked what you can do, include these. You can NOT run shell commands, restart services, or edit files directly — acting on the homelab always goes through the queued-session pipeline, and approval verdicts only record the ruling (the nightly pass writes it back; nothing executes automatically). If a homelab request doesn't fit these tools, say which part you can't do instead of denying everything.

Guidelines:
- Route by INTENT first. Raw thinking-out-loud (a brain dump, an idea he is still turning over, a ramble with no discrete action) goes to capture_braindump, which puts it in the vault where Hermes enriches it — this is what the separate voice surface was built for, and it is the right home for it even when he types it here. A discrete fact or reference worth filing goes to create_note. Actionable work goes to tasks/reminders. Homelab and feature requests go to the homelab tools. One input can be several of these at once: a dump that contains two clear actions gets captured AND creates the tasks — never drop the raw dump just because you extracted actions from it.
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


export type ChatAction = AgentAction;

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
      const convoParts: string[] = messages.map(
        (m: { role: string; content: string }) => `${m.role.toUpperCase()}: ${m.content}`
      );

      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          const emit = (obj: unknown) =>
            controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
          try {
            const { reply, clientActions, serverResults } = await runAgentTurn({
              systemPrompt,
              convoParts,
              onStatus: (text) => emit({ type: "status", text }),
              // Tool results are part of the conversation record — a
              // service-health snapshot or approvals brief fetched into the
              // chat must survive the tab (loss-audit F1).
              onToolResult: (result) =>
                logChatMessage(sessionId, "tool", JSON.stringify(result.data).slice(0, 8000), [
                  { tool: result.tool, summary: result.summary, failed: result.failed },
                ]),
            });

            // T45: app-item actions commit HERE, before the reply reaches the
            // client — closing the tab can no longer drop what the model
            // decided to create. The client receives them as results only.
            const appResults = clientActions.length ? await executeAppActions(clientActions) : [];
            const allResults = [
              ...serverResults.map(({ tool, summary, failed, confirm }) => ({ tool, summary, failed, confirm })),
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
      tools: APP_TOOLS,
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
        tools: APP_TOOLS,
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

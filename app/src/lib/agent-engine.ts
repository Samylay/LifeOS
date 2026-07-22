// The shared agent turn behind BOTH the Assistant chat panel and the /voice
// VoicePal surface. `claude -p` has no native function calling, so the tool
// catalog (app-item tools + homelab tools) is described in the prompt and the
// model returns a { reply, actions } JSON envelope. Homelab tools execute HERE
// in a bounded loop — each round's TOOL_RESULT lines are appended to the
// conversation and the model is called again, so it can answer from real data
// or chain a check before an action. App-item actions are returned to the
// caller (executeAppActions) so each surface keeps its own commit + logging
// contract.
import OpenAI from "openai";
import { generateJson } from "./claude-cli";
import {
  HOMELAB_TOOLS,
  HOMELAB_TOOL_NAMES,
  HOMELAB_TOOL_STATUS,
  executeHomelabTool,
  type HomelabToolResult,
} from "./homelab-tools";

export interface AgentAction {
  tool: string;
  input: Record<string, unknown>;
}

export const APP_TOOLS: OpenAI.ChatCompletionTool[] = [
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
      name: "capture_braindump",
      description:
        "Capture raw, unstructured thinking — a brain dump, a rambling idea, a voice ramble with no clear action in it — into the vault voice inbox, where Hermes picks it up and enriches it. Use this INSTEAD of create_note when the input is thinking-out-loud rather than a discrete fact or reference to file. If the dump also contains clear actions, capture the dump AND create the tasks.",
      parameters: {
        type: "object",
        properties: {
          content: {
            type: "string",
            description:
              "The dump, verbatim. Do not summarise or clean it up — the raw wording is the point.",
          },
          category: {
            type: "string",
            description:
              "Short lowercase kind of dump, e.g. 'braindump', 'idea', 'reflection' (optional).",
          },
        },
        required: ["content"],
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

const TOOL_CATALOG = [
  ...APP_TOOLS
    .filter((t): t is OpenAI.ChatCompletionFunctionTool => t.type === "function")
    .map((t) => t.function),
  ...HOMELAB_TOOLS,
];

export interface AgentTurnOptions {
  systemPrompt: string;
  /** Conversation lines ("USER: …", "ASSISTANT: …"). Mutated: homelab tool
   * rounds append their calls and TOOL_RESULT lines so the caller can persist
   * the full record if it wants to. */
  convoParts: string[];
  maxRounds?: number;
  /** When true the envelope also carries `followUps` (the /voice Shadow
   * Reader questions). */
  includeFollowUps?: boolean;
  /** Live tool-activity line, streamed to the UI while a tool runs. */
  onStatus?: (text: string) => void;
  /** Called after each homelab tool executes (chat persists these). */
  onToolResult?: (result: HomelabToolResult) => void;
}

export interface AgentTurnOutcome {
  reply: string;
  followUps: string[];
  /** App-item actions for the caller to commit via executeAppActions. */
  clientActions: AgentAction[];
  serverResults: HomelabToolResult[];
}

export async function runAgentTurn(opts: AgentTurnOptions): Promise<AgentTurnOutcome> {
  const { systemPrompt, convoParts, maxRounds = 4, includeFollowUps, onStatus, onToolResult } = opts;
  const envelopeShape = includeFollowUps
    ? `{"reply": "<short natural-language summary for the user>", "followUps": ["<2-3 short spoken-style follow-up questions>"], "actions": [{"tool": "<tool name>", "input": { ...args matching that tool's schema }}]}`
    : `{"reply": "<short natural-language summary for the user>", "actions": [{"tool": "<tool name>", "input": { ...args matching that tool's schema }}]}`;

  const serverResults: HomelabToolResult[] = [];
  let reply = "";
  let followUps: string[] = [];
  let clientActions: AgentAction[] = [];

  for (let round = 0; round < maxRounds; round++) {
    const prompt = [
      systemPrompt,
      "",
      "You can act by emitting tool calls. Available tools (JSON schema):",
      JSON.stringify(TOOL_CATALOG, null, 2),
      "",
      `Homelab tools (${[...HOMELAB_TOOL_NAMES].join(", ")}) are executed by the server and their results are appended to the conversation as TOOL_RESULT lines — call them and WAIT for results before answering about homelab state or emitting app-item actions. App-item tools (create_tasks, create_habit, create_note, create_reminder, create_project, complete_task) are executed by the server from your FINAL response — only emit them in a response that contains no homelab tool calls, and never repeat ones you already emitted.`,
      "",
      "Conversation so far:",
      convoParts.join("\n\n"),
      "",
      "Respond with ONLY a JSON object of this exact shape — no markdown, no prose outside it:",
      envelopeShape,
      "Put every action you want to take in `actions`. If no tool is needed (a question or normal chat), return an empty `actions` array and put your full answer in `reply`.",
    ].join("\n");

    const envelope = await generateJson<{
      reply?: string;
      followUps?: string[];
      actions?: AgentAction[];
    }>(prompt);
    reply = typeof envelope.reply === "string" ? envelope.reply : "";
    followUps = Array.isArray(envelope.followUps)
      ? envelope.followUps.slice(0, 3).filter((q): q is string => typeof q === "string" && !!q)
      : [];
    const actions = Array.isArray(envelope.actions) ? envelope.actions : [];
    const homelabCalls = actions.filter((a) => HOMELAB_TOOL_NAMES.has(a.tool));
    clientActions = actions.filter((a) => !HOMELAB_TOOL_NAMES.has(a.tool));

    if (homelabCalls.length === 0 || round === maxRounds - 1) break;

    convoParts.push(`ASSISTANT (tool calls): ${JSON.stringify(homelabCalls)}`);
    for (const call of homelabCalls) {
      onStatus?.(HOMELAB_TOOL_STATUS[call.tool] ?? `Running ${call.tool}…`);
      const result = await executeHomelabTool(call.tool, call.input ?? {});
      serverResults.push(result);
      onToolResult?.(result);
      convoParts.push(
        `TOOL_RESULT (${result.tool}${result.failed ? ", FAILED" : ""}): ${JSON.stringify(result.data)}`
      );
    }
    onStatus?.("Thinking…");
  }

  return { reply, followUps, clientActions, serverResults };
}

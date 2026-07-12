"use client";

import { useState, useCallback, useRef } from "react";
import { useTasks } from "./use-tasks";
import { useHabits } from "./use-habits";
import { useNotes } from "./use-notes";
import { useReminders } from "./use-reminders";
import { useProjects } from "./use-projects";
import type { ChatAction } from "@/app/api/chat/route";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  actions?: ActionResult[];
  timestamp: Date;
}

export interface ActionResult {
  tool: string;
  summary: string;
  count?: number;
  failed?: boolean;
}

let msgId = 0;

const newSessionId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `s-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  // Live tool-activity line ("Checking what's queued…") streamed by the API
  // while homelab tools run, so the panel never sits on a silent spinner.
  const [statusText, setStatusText] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // T45: conversation id — the server persists every exchange under it, and
  // clearing the panel finishes the session (routes it to the vault).
  const sessionRef = useRef<string>(newSessionId());

  const { tasks, createTask, updateTask } = useTasks();
  const { habits, createHabit } = useHabits();
  const { notes, createNote } = useNotes();
  const { reminders, createReminder } = useReminders();
  const { projects, createProject } = useProjects();

  const executeActions = useCallback(
    async (actions: ChatAction[]): Promise<ActionResult[]> => {
      const results: ActionResult[] = [];

      for (const action of actions) {
        try {
          switch (action.tool) {
            case "create_tasks": {
              const tasksData = (action.input as { tasks: Array<{
                title: string;
                priority: "low" | "medium" | "high" | "urgent";
                area?: "health" | "career" | "finance" | "brand" | "admin";
                dueDate?: string;
              }> }).tasks;
              for (const t of tasksData) {
                await createTask({
                  title: t.title,
                  priority: t.priority || "medium",
                  status: "todo",
                  area: t.area,
                  dueDate: t.dueDate ? new Date(t.dueDate) : undefined,
                });
              }
              results.push({
                tool: "create_tasks",
                summary: `Created ${tasksData.length} task${tasksData.length > 1 ? "s" : ""}`,
                count: tasksData.length,
              });
              break;
            }
            case "create_habit": {
              const h = action.input as {
                name: string;
                frequency: "daily" | "weekly";
                area?: "health" | "career" | "finance" | "brand" | "admin";
              };
              await createHabit({
                name: h.name,
                frequency: h.frequency,
                streak: 0,
                history: [],
                area: h.area,
              });
              results.push({
                tool: "create_habit",
                summary: `Created habit: "${h.name}"`,
              });
              break;
            }
            case "create_note": {
              const n = action.input as {
                content: string;
                tags?: string[];
                area?: "health" | "career" | "finance" | "brand" | "admin";
              };
              await createNote({
                content: n.content,
                tags: n.tags || [],
                processed: false,
                area: n.area,
              });
              results.push({
                tool: "create_note",
                summary: `Captured note${n.tags?.length ? ` [${n.tags.join(", ")}]` : ""}`,
              });
              break;
            }
            case "create_reminder": {
              const r = action.input as {
                title: string;
                frequency: "once" | "daily" | "weekly" | "monthly" | "yearly";
                dueDate: string;
                time?: string;
                area?: "health" | "career" | "finance" | "brand" | "admin";
              };
              await createReminder({
                title: r.title,
                frequency: r.frequency,
                dueDate: new Date(r.dueDate),
                time: r.time,
                area: r.area,
                notes: undefined,
                lastCompletedDate: undefined,
              });
              results.push({
                tool: "create_reminder",
                summary: `Created reminder: "${r.title}"`,
              });
              break;
            }
            case "create_project": {
              const p = action.input as {
                title: string;
                area?: "health" | "career" | "finance" | "brand" | "admin";
                status?: "planning" | "active" | "paused";
              };
              await createProject({
                title: p.title,
                area: p.area,
                status: p.status || "planning",
                linkedTaskIds: [],
              });
              results.push({
                tool: "create_project",
                summary: `Created project: "${p.title}"`,
              });
              break;
            }
            case "complete_task": {
              const c = action.input as { title: string };
              const target = tasks.find(
                (t) =>
                  t.status !== "done" &&
                  t.title.toLowerCase().includes(c.title.toLowerCase())
              );
              if (target) {
                await updateTask(target.id, { status: "done" });
                results.push({
                  tool: "complete_task",
                  summary: `Completed: "${target.title}"`,
                });
              } else {
                results.push({
                  tool: "complete_task",
                  summary: `Failed: complete_task (no match for "${c.title}")`,
                });
              }
              break;
            }
          }
        } catch (err) {
          console.error(`Failed to execute ${action.tool}:`, err);
          results.push({
            tool: action.tool,
            summary: `Failed: ${action.tool}`,
          });
        }
      }

      return results;
    },
    [
      createTask,
      updateTask,
      tasks,
      createHabit,
      createNote,
      createReminder,
      createProject,
    ]
  );

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || loading) return;

      // Add user message
      const userMsg: ChatMessage = {
        id: `msg-${++msgId}`,
        role: "user",
        content: content.trim(),
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setLoading(true);

      try {
        // Build context from current app state
        const context = {
          taskCount: tasks.length,
          existingTasks: tasks.slice(0, 30).map((t) => t.title),
          existingHabits: habits.map((h) => h.name),
          existingProjects: projects.map((p) => p.title),
        };

        // Build message history for API (last 20 messages)
        const history = [...messages, userMsg].slice(-20).map((m) => ({
          role: m.role,
          content: m.content,
        }));

        const controller = new AbortController();
        abortRef.current = controller;

        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: history, context, sessionId: sessionRef.current }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          const errCode = errData.error || `http_${res.status}`;
          const err = new Error(errData.message || `HTTP ${res.status}`);
          (err as Error & { code: string }).code = errCode;
          throw err;
        }

        // The claude-cli path streams NDJSON ({type:"status"} tool-activity
        // lines, then {type:"final"}); the Ollama fallback returns plain JSON.
        let data: { reply: string; actions?: ChatAction[]; serverResults?: ActionResult[] };
        if (res.headers.get("content-type")?.includes("ndjson")) {
          data = { reply: "" };
          const reader = res.body!.getReader();
          const decoder = new TextDecoder();
          let buf = "";
          let done = false;
          while (!done) {
            const chunk = await reader.read();
            done = chunk.done;
            buf += decoder.decode(chunk.value ?? new Uint8Array(), { stream: !done });
            let nl;
            while ((nl = buf.indexOf("\n")) >= 0) {
              const line = buf.slice(0, nl).trim();
              buf = buf.slice(nl + 1);
              if (!line) continue;
              const evt = JSON.parse(line);
              if (evt.type === "status") setStatusText(evt.text);
              else if (evt.type === "final") data = evt;
              else if (evt.type === "error") throw new Error(evt.message);
            }
          }
        } else {
          data = await res.json();
        }

        // Execute client-side actions from AI tool calls
        let actionResults: ActionResult[] = data.serverResults ?? [];
        if (data.actions?.length) {
          setStatusText(null);
          actionResults = [...actionResults, ...(await executeActions(data.actions))];
        }

        const assistantMsg: ChatMessage = {
          id: `msg-${++msgId}`,
          role: "assistant",
          content: data.reply,
          actions: actionResults.length > 0 ? actionResults : undefined,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, assistantMsg]);
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") return;

        const code =
          err != null && typeof err === "object" && "code" in err
            ? (err as { code: string }).code
            : undefined;

        let content: string;
        switch (code) {
          case "quota_exceeded":
            content = "The local model is busy. Please wait a moment and try again.";
            break;
          default:
            content = `Something went wrong: ${err instanceof Error ? err.message : "Unknown error"}. Check that the Claude CLI is reachable (or Ollama, if GEN_PROVIDER=ollama).`;
        }

        const errorMsg: ChatMessage = {
          id: `msg-${++msgId}`,
          role: "assistant",
          content,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, errorMsg]);
      } finally {
        setLoading(false);
        setStatusText(null);
        abortRef.current = null;
      }
    },
    [loading, messages, tasks, habits, projects, executeActions]
  );

  const clearMessages = useCallback(() => {
    // Clearing = the conversation is finished: tell the server to route it to
    // the vault (fire-and-forget — the transcript is already persisted
    // server-side, so even a lost request only delays routing to the sweep).
    const sessionId = sessionRef.current;
    fetch("/api/chat/end", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    }).catch(() => {});
    sessionRef.current = newSessionId();
    setMessages([]);
  }, []);

  return { messages, loading, statusText, sendMessage, clearMessages };
}

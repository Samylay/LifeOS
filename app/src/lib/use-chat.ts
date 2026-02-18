"use client";

import { useState, useCallback, useRef } from "react";
import { useTasks } from "./use-tasks";
import { useGoals } from "./use-goals";
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
}

let msgId = 0;

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const { tasks, createTask } = useTasks();
  const { goals, createGoal } = useGoals();
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
            case "create_goal": {
              const g = action.input as {
                title: string;
                year: number;
                quarter?: 1 | 2 | 3 | 4;
              };
              await createGoal({
                title: g.title,
                year: g.year,
                quarter: g.quarter,
                status: "active",
                linkedProjectIds: [],
              });
              results.push({
                tool: "create_goal",
                summary: `Created goal: "${g.title}"`,
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
    [createTask, createGoal, createHabit, createNote, createReminder, createProject]
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
          existingGoals: goals.map((g) => g.title),
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
          body: JSON.stringify({ messages: history, context }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          const errCode = errData.error || `http_${res.status}`;
          const err = new Error(errData.message || `HTTP ${res.status}`);
          (err as Error & { code: string }).code = errCode;
          throw err;
        }

        const data = await res.json();

        // Execute actions from AI tool calls
        let actionResults: ActionResult[] = [];
        if (data.actions?.length) {
          actionResults = await executeActions(data.actions);
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
            content =
              "Gemini API rate limit exceeded. The free tier allows 15 requests/minute. Please wait a moment and try again.";
            break;
          case "invalid_api_key":
            content =
              "Your Gemini API key is invalid or expired. Please update GEMINI_API_KEY in your .env.local file.";
            break;
          default:
            content = `Something went wrong: ${err instanceof Error ? err.message : "Unknown error"}. Make sure your GEMINI_API_KEY is set in .env.local.`;
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
        abortRef.current = null;
      }
    },
    [loading, messages, tasks, goals, habits, projects, executeActions]
  );

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return { messages, loading, sendMessage, clearMessages };
}

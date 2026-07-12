// Server-side execution of the chat assistant's app-item actions (T45,
// loss-audit F1). These used to run client-side after the response reached
// the browser (use-chat.ts executeActions) — closing the tab between the
// model's reply and execution silently dropped items the model had decided
// to create. Executing here means every action commits before the reply is
// even sent. Writes use the same `users/local/<collection>` paths and
// `{ __date }` markers the client's serializeDates produces, so documents
// created here are indistinguishable from client-created ones.
import { createDoc, listDocs, updateDoc } from "./server-db";
import type { ChatAction } from "@/app/api/chat/route";

export interface AppActionResult {
  tool: string;
  summary: string;
  count?: number;
  failed?: boolean;
}

const COLL = (name: string) => `users/local/${name}`;

function enc(d: Date): { __date: string } {
  return { __date: d.toISOString() };
}

function stamps() {
  const now = enc(new Date());
  return { createdAt: now, updatedAt: now };
}

export async function executeAppActions(actions: ChatAction[]): Promise<AppActionResult[]> {
  const results: AppActionResult[] = [];
  for (const action of actions) {
    try {
      switch (action.tool) {
        case "create_tasks": {
          const tasksData = (action.input as {
            tasks: Array<{ title: string; priority?: string; area?: string; dueDate?: string }>;
          }).tasks;
          for (const t of tasksData) {
            createDoc(COLL("tasks"), {
              title: t.title,
              priority: t.priority || "medium",
              status: "todo",
              ...(t.area ? { area: t.area } : {}),
              ...(t.dueDate ? { dueDate: enc(new Date(t.dueDate)) } : {}),
              ...stamps(),
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
          const h = action.input as { name: string; frequency: string; area?: string };
          createDoc(COLL("habits"), {
            name: h.name,
            frequency: h.frequency,
            streak: 0,
            history: [],
            ...(h.area ? { area: h.area } : {}),
            ...stamps(),
          });
          results.push({ tool: "create_habit", summary: `Created habit: "${h.name}"` });
          break;
        }
        case "create_note": {
          const n = action.input as { content: string; tags?: string[]; area?: string };
          createDoc(COLL("notes"), {
            content: n.content,
            tags: n.tags || [],
            processed: false,
            ...(n.area ? { area: n.area } : {}),
            ...stamps(),
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
            frequency: string;
            dueDate: string;
            time?: string;
            area?: string;
          };
          createDoc(COLL("reminders"), {
            title: r.title,
            frequency: r.frequency,
            dueDate: enc(new Date(r.dueDate)),
            ...(r.time ? { time: r.time } : {}),
            ...(r.area ? { area: r.area } : {}),
            ...stamps(),
          });
          results.push({ tool: "create_reminder", summary: `Created reminder: "${r.title}"` });
          break;
        }
        case "create_project": {
          const p = action.input as { title: string; area?: string; status?: string };
          createDoc(COLL("projects"), {
            title: p.title,
            status: p.status || "planning",
            linkedTaskIds: [],
            ...(p.area ? { area: p.area } : {}),
            ...stamps(),
          });
          results.push({ tool: "create_project", summary: `Created project: "${p.title}"` });
          break;
        }
        case "complete_task": {
          const c = action.input as { title: string };
          const open = (listDocs(COLL("tasks")) as Array<{ id: string; title?: string; status?: string }>)
            .filter((t) => t.status !== "done");
          const target = open.find((t) =>
            (t.title || "").toLowerCase().includes(c.title.toLowerCase())
          );
          if (target) {
            updateDoc(COLL("tasks"), target.id, { status: "done", updatedAt: enc(new Date()) });
            results.push({ tool: "complete_task", summary: `Completed: "${target.title}"` });
          } else {
            results.push({
              tool: "complete_task",
              summary: `Failed: complete_task (no match for "${c.title}")`,
              failed: true,
            });
          }
          break;
        }
        default:
          results.push({ tool: action.tool, summary: `Failed: unknown tool ${action.tool}`, failed: true });
      }
    } catch (err) {
      console.error(`Failed to execute ${action.tool}:`, err);
      results.push({ tool: action.tool, summary: `Failed: ${action.tool}`, failed: true });
    }
  }
  return results;
}

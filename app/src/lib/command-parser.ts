import type { Task, TaskStatus, TaskPriority, AreaId } from "./types";

export type CommandAction =
  | "delete"
  | "complete"
  | "start"
  | "cancel"
  | "reopen"
  | "set_priority"
  | "set_area"
  | "create";

export interface ParsedCommand {
  action: CommandAction;
  /** IDs of tasks matched by the command */
  matchedTaskIds: string[];
  /** For set_priority */
  priority?: TaskPriority;
  /** For set_area */
  area?: AreaId;
  /** For create */
  newTitle?: string;
  /** Human-readable description of the command */
  description: string;
}

const DELETE_PATTERNS = [
  /\b(?:remove|delete|trash|get rid of|drop|eliminate)\b/i,
];
const COMPLETE_PATTERNS = [
  /\b(?:complete|finish|done|mark.*done|check off|tick off)\b/i,
];
const START_PATTERNS = [
  /\b(?:start|begin|work on|in progress|move to in progress)\b/i,
];
const CANCEL_PATTERNS = [/\b(?:cancel|abandon|skip|nevermind)\b/i];
const REOPEN_PATTERNS = [/\b(?:reopen|undo|bring back|restore|uncheck)\b/i];
const CREATE_PATTERNS = [
  /\b(?:add|create|new task|make a task|remind me to)\b/i,
];

const PRIORITY_MAP: Record<string, TaskPriority> = {
  urgent: "urgent",
  high: "high",
  medium: "medium",
  low: "low",
  critical: "urgent",
  important: "high",
};

const AREA_MAP: Record<string, AreaId> = {
  health: "health",
  training: "health",
  fitness: "health",
  workout: "health",
  career: "career",
  learning: "career",
  work: "career",
  finance: "finance",
  money: "finance",
  budget: "finance",
  brand: "brand",
  "personal brand": "brand",
  social: "brand",
  admin: "admin",
  "life admin": "admin",
};

const PRIORITY_PATTERNS = [
  /\b(?:set|change|make|mark).*(?:priority|urgency)\s+(?:to\s+)?(\w+)/i,
  /\b(?:prioritize|prioritise)\b/i,
  /\bmake.*\b(urgent|high|medium|low)\b/i,
];

const AREA_PATTERNS = [
  /\b(?:move|assign|set|tag|categorize).*(?:area|category)\s+(?:to\s+)?(.+)/i,
  /\btag.*as\s+(.+)/i,
];

/**
 * Calculate a similarity score between two strings (0-1).
 * Uses a simple token overlap + substring approach.
 */
function similarity(a: string, b: string): number {
  const al = a.toLowerCase().trim();
  const bl = b.toLowerCase().trim();

  if (al === bl) return 1;
  if (al.includes(bl) || bl.includes(al)) return 0.85;

  const aTokens = al.split(/\s+/);
  const bTokens = bl.split(/\s+/);
  let matchCount = 0;
  for (const at of aTokens) {
    for (const bt of bTokens) {
      if (at === bt || (at.length > 3 && bt.includes(at)) || (bt.length > 3 && at.includes(bt))) {
        matchCount++;
        break;
      }
    }
  }
  return matchCount / Math.max(aTokens.length, bTokens.length);
}

/**
 * Extract the task reference portion from the input text
 * by stripping out the action verb prefix.
 */
function extractSubject(text: string): string {
  // Strip common prefixes
  return text
    .replace(
      /^(please\s+)?(can you\s+)?(remove|delete|trash|get rid of|drop|eliminate|complete|finish|done|mark\s+as\s+done|check off|tick off|start|begin|work on|cancel|abandon|skip|reopen|undo|bring back|restore|uncheck|add|create|new task|make a task|remind me to)\s*/i,
      ""
    )
    .replace(/^(the|my|that|those|this|these)\s+/i, "")
    .replace(/\s*(task|todo|item|tasks|todos|items)$/i, "")
    .trim();
}

/**
 * Find tasks that match the subject text via fuzzy matching.
 */
function findMatchingTasks(subject: string, tasks: Task[], threshold = 0.4): Task[] {
  if (!subject) return [];

  const scored = tasks
    .map((task) => ({
      task,
      score: similarity(subject, task.title),
    }))
    .filter((s) => s.score >= threshold)
    .sort((a, b) => b.score - a.score);

  // If best match is very strong, only return that one
  if (scored.length > 0 && scored[0].score > 0.8) {
    return [scored[0].task];
  }

  // Return all reasonable matches (top 5 max)
  return scored.slice(0, 5).map((s) => s.task);
}

function detectAction(text: string): CommandAction | null {
  for (const p of DELETE_PATTERNS) if (p.test(text)) return "delete";
  for (const p of COMPLETE_PATTERNS) if (p.test(text)) return "complete";
  for (const p of START_PATTERNS) if (p.test(text)) return "start";
  for (const p of CANCEL_PATTERNS) if (p.test(text)) return "cancel";
  for (const p of REOPEN_PATTERNS) if (p.test(text)) return "reopen";
  for (const p of PRIORITY_PATTERNS) if (p.test(text)) return "set_priority";
  for (const p of AREA_PATTERNS) if (p.test(text)) return "set_area";
  for (const p of CREATE_PATTERNS) if (p.test(text)) return "create";
  return null;
}

function detectPriority(text: string): TaskPriority | undefined {
  for (const [keyword, priority] of Object.entries(PRIORITY_MAP)) {
    if (text.toLowerCase().includes(keyword)) return priority;
  }
  return undefined;
}

function detectArea(text: string): AreaId | undefined {
  for (const [keyword, area] of Object.entries(AREA_MAP)) {
    if (text.toLowerCase().includes(keyword)) return area;
  }
  return undefined;
}

export function parseCommand(
  input: string,
  tasks: Task[]
): ParsedCommand | null {
  const text = input.trim();
  if (!text) return null;

  const action = detectAction(text);
  if (!action) return null;

  if (action === "create") {
    const subject = extractSubject(text);
    return {
      action: "create",
      matchedTaskIds: [],
      newTitle: subject || text,
      priority: detectPriority(text),
      area: detectArea(text),
      description: `Create new task: "${subject || text}"`,
    };
  }

  const subject = extractSubject(text);
  const matched = findMatchingTasks(subject, tasks);

  if (matched.length === 0) return null;

  const actionLabels: Record<CommandAction, string> = {
    delete: "Delete",
    complete: "Mark as done",
    start: "Start working on",
    cancel: "Cancel",
    reopen: "Reopen",
    set_priority: "Change priority of",
    set_area: "Recategorize",
    create: "Create",
  };

  const taskNames = matched.map((t) => `"${t.title}"`).join(", ");

  return {
    action,
    matchedTaskIds: matched.map((t) => t.id),
    priority: action === "set_priority" ? detectPriority(text) : undefined,
    area: action === "set_area" ? detectArea(text) : undefined,
    description: `${actionLabels[action]} ${taskNames}`,
  };
}

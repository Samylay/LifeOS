// Server-executed homelab tools for the chat Assistant — the bridge between
// the in-app chat and the homelab. Every action routes through the same safe
// machinery the /decide surfaces already use (promptQueue → promptDispatch →
// host poller; decisionQueue verdicts): the chat can queue and launch work or
// record rulings, but never runs shell commands, restarts services, or
// touches ROADMAPs directly.
import fs from "node:fs";
import { listDocs, createDoc, getDoc, updateDoc } from "@/lib/server-db";
import { getAllContainers } from "@/lib/system-health";
import { getHostMetrics, getStandingGoals } from "@/lib/metrics";
import { DECISION_VERDICTS, type DecisionVerdict, type DecisionItem } from "@/lib/decisions";

const PROMPT_QUEUE = "users/local/promptQueue";
const DISPATCH = "users/local/promptDispatch";
const DECISION_QUEUE = "users/local/decisionQueue";
const TRIAGE_QUEUE = "users/local/triageQueue";
// Mounted read-only at the same host path (docker-compose.yml).
const AUTOLOOP_LOG = "/home/quorky/services/autoloop/autoloop.log";

export interface HomelabToolResult {
  tool: string;
  summary: string; // short human line for the chat badge
  data: unknown; // structured result fed back to the model
  failed?: boolean;
  // Set when Samy asked for run-now on a queued prompt: the UI renders a
  // one-tap confirm that launches JUST this prompt via /api/triage/dispatch.
  // The model can only REQUEST it — the tap is what launches (T47 stays).
  confirm?: { promptId: string; title: string };
}

// ── dispatch core (shared with /api/triage/dispatch) ─────────────────────────

// One merged brief must not grow so large that a single Claude session chokes
// on it, so a big queue is split into several dispatch docs — the host poller
// launches one session per pending doc, so this fans the load out. Batches are
// packed greedily under both a per-brief character budget and an item cap.
const MAX_DISPATCH_CHARS = 24_000; // per merged brief (a lone giant item still gets its own)
const MAX_DISPATCH_ITEMS = 8; // even small items cap per session so briefs stay actionable

interface QueuedPrompt { id: string; title?: string; prompt?: string; itemId?: string }

// Greedily pack queued prompts into batches that each stay under the char and
// item budgets. A single prompt over the char budget gets its own batch rather
// than being dropped.
function batchPrompts(queued: QueuedPrompt[]): QueuedPrompt[][] {
  const batches: QueuedPrompt[][] = [];
  let current: QueuedPrompt[] = [];
  let chars = 0;
  for (const q of queued) {
    const size = (q.prompt ?? "").length + (q.title ?? "").length + 32; // + item heading
    const wouldOverflow = current.length > 0 && (chars + size > MAX_DISPATCH_CHARS || current.length >= MAX_DISPATCH_ITEMS);
    if (wouldOverflow) {
      batches.push(current);
      current = [];
      chars = 0;
    }
    current.push(q);
    chars += size;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

export function dispatchQueuedPrompts(opts?: { promptId?: string }):
  | { ok: true; dispatchId: string; dispatchIds: string[]; batchCount: number; itemCount: number; titles: string[] }
  | { ok: false; error: string } {
  let queued = listDocs(PROMPT_QUEUE, {
    where: [["status", "==", "queued"]],
    orderBy: ["queuedAt", "asc"],
  }) as QueuedPrompt[];

  // Run-now confirm: launch exactly the one prompt Samy tapped, leaving the
  // rest of the queue for the normal /decide flow.
  if (opts?.promptId) {
    queued = queued.filter((q) => q.id === opts.promptId);
    if (queued.length === 0) return { ok: false, error: "prompt not found or no longer queued" };
  }

  if (queued.length === 0) return { ok: false, error: "prompt queue is empty" };

  const batches = batchPrompts(queued);
  const total = queued.length;
  const dispatchIds: string[] = [];

  batches.forEach((batch, b) => {
    const partOf = batches.length > 1 ? ` — part ${b + 1} of ${batches.length}` : "";
    const header =
      `${batch.length} approved item(s) from the LifeOS /decide deck need acting on${partOf}. ` +
      "Work through them one at a time; verify each before moving on. " +
      "If one is blocked, note why and continue with the rest. Report per-item outcomes at the end.";
    const merged = [
      header,
      ...batch.map((q, i) => `## Item ${i + 1}: ${q.title || "untitled"}\n\n${q.prompt ?? ""}`),
    ].join("\n\n");

    const dispatchId = createDoc(DISPATCH, {
      prompt: merged,
      itemCount: batch.length,
      titles: batch.map((q) => q.title ?? ""),
      batch: batches.length > 1 ? { index: b + 1, of: batches.length } : null,
      status: "pending",
      createdAt: { __date: new Date().toISOString() },
    });
    for (const q of batch) {
      updateDoc(PROMPT_QUEUE, q.id, { status: "dispatched", dispatchId });
      // Handing a card to Claude means it has been acted on — retire the source
      // triage item so it leaves the Approved view (which lists only `filed`).
      // Guard on `filed` so a re-dispatch or a manual discard is never clobbered.
      if (q.itemId) {
        const item = getDoc(TRIAGE_QUEUE, q.itemId);
        if (item && item.status === "filed") {
          updateDoc(TRIAGE_QUEUE, q.itemId, {
            status: "done",
            treatedAt: { __date: new Date().toISOString() },
          });
        }
      }
    }
    dispatchIds.push(dispatchId);
  });

  return {
    ok: true,
    dispatchId: dispatchIds[0], // back-compat: first batch
    dispatchIds,
    batchCount: batches.length,
    itemCount: total,
    titles: queued.map((q) => q.title ?? ""),
  };
}

// ── tool catalog (prompt-level schema, same style as the client tools) ───────

export const HOMELAB_TOOLS = [
  {
    name: "homelab_overview",
    description:
      "Snapshot of everything pending across the decide system: prompts queued for a Claude session (the 'approve page' queue), pending triage cards, pending NEEDS-SAMY approvals, and standing-goal health. Use this first when the user asks what's queued or pending.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  // NOTE (T47, Samy 2026-07-14 option b): chat may QUEUE but never LAUNCH.
  // `launch_queued_prompts` and `queue_homelab_prompt`'s `launch_now` used to
  // let a single chat message — reachable from the phone — start an autonomous
  // Claude Code session with arbitrary instructions within ~10s. That is T29's
  // recorded threat model ("phone message → effective root") arriving via the
  // sanctioned path. Launching is now a UI action only. Do not re-add a
  // launch tool here: dispatchQueuedPrompts stays exported for that route, and
  // the queue is the gate. Adding one back reopens the phone-to-root gap.
  //
  // `run_now` below does NOT reopen it: it only marks the queued doc and
  // surfaces a confirm chip — the launch still requires Samy's tap in the UI
  // (POST /api/triage/dispatch {promptId}). Model output never launches.
  {
    name: "queue_homelab_prompt",
    description:
      "Queue a NEW ad-hoc instruction for a Claude Code session on the homelab (e.g. 'have claude check why the backup is slow'). It is only QUEUED — say that plainly. It does not run until Samy launches it from the /decide approve page; chat cannot launch it. If he EXPLICITLY says to run it right now / immediately / skip the queue THIS time, set run_now: the UI will show him a one-tap Run now confirm (you still cannot launch it yourself).",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short title for the queued work" },
        prompt: { type: "string", description: "Full instruction for the Claude session" },
        run_now: {
          type: "boolean",
          description:
            "ONLY when Samy explicitly asked, in this conversation, to run it now / immediately / without waiting for the queue. Never infer it from urgency.",
        },
      },
      required: ["title", "prompt"],
    },
  },
  {
    name: "get_service_health",
    description:
      "Live homelab service health: watched docker containers (up/down) and host vitals (cpu/mem/disk). Same data as the /status page.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_autoloop_summary",
    description:
      "The last nightly autoloop run: per-project outcomes and the final done/failed summary line.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "list_pending_approvals",
    description:
      "Pending NEEDS-SAMY approval cards with their context briefs (what's asked, why blocked, consequences, recommendation).",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max cards to return (default 10)" },
      },
      required: [],
    },
  },
  {
    name: "record_approval_verdict",
    description:
      "Record the user's ruling on one pending NEEDS-SAMY approval card (does NOT execute the action — the verdict is written back to the ROADMAP by the nightly pass). Identify the card by id (from list_pending_approvals) or a distinctive title fragment.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Card id from list_pending_approvals (preferred)" },
        title: { type: "string", description: "Distinctive fragment of the card title (fallback; must match exactly one pending card)" },
        verdict: { type: "string", enum: [...DECISION_VERDICTS] },
        note: { type: "string", description: "Optional nuance to carry with the verdict" },
      },
      required: ["verdict"],
    },
  },
  {
    name: "add_learning_topic",
    description:
      "Add a topic to the user's teaching queue (the 'Teach me' section on /knowledge) when he says he wants to learn/study/go deep on something. A topic cannot exist without a mission — ALWAYS ask why before calling this if he hasn't said.",
    parameters: {
      type: "object",
      properties: {
        topic: { type: "string", description: "What he wants to learn" },
        mission: { type: "string", description: "Why — grounds every future lesson (required)" },
      },
      required: ["topic", "mission"],
    },
  },
] as const;

export const HOMELAB_TOOL_NAMES = new Set<string>(HOMELAB_TOOLS.map((t) => t.name));

// Short present-progressive labels streamed to the chat while a tool runs.
export const HOMELAB_TOOL_STATUS: Record<string, string> = {
  homelab_overview: "Checking what's queued…",
  queue_homelab_prompt: "Queueing it for a Claude session…",
  get_service_health: "Checking service health…",
  get_autoloop_summary: "Reading the last nightly run…",
  list_pending_approvals: "Fetching pending approvals…",
  record_approval_verdict: "Recording your verdict…",
  add_learning_topic: "Adding it to your learning queue…",
};

// ── executors ────────────────────────────────────────────────────────────────

function lastAutoloopRun(): { lines: string[]; summary: string | null } {
  let text: string;
  try {
    const stat = fs.statSync(AUTOLOOP_LOG);
    const fd = fs.openSync(AUTOLOOP_LOG, "r");
    const start = Math.max(0, stat.size - 16 * 1024);
    const buf = Buffer.alloc(stat.size - start);
    fs.readSync(fd, buf, 0, buf.length, start);
    fs.closeSync(fd);
    text = buf.toString("utf8");
  } catch {
    return { lines: [], summary: null };
  }
  const lines = text.split("\n").filter(Boolean);
  // Walk back from the last SUMMARY line to the end of the previous run.
  let end = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].includes("SUMMARY:")) { end = i; break; }
  }
  if (end === -1) return { lines: lines.slice(-20), summary: null };
  let start = 0;
  for (let i = end - 1; i >= 0; i--) {
    if (lines[i].includes("SUMMARY:")) { start = i + 1; break; }
  }
  return { lines: lines.slice(start, end + 1), summary: lines[end] };
}

export async function executeHomelabTool(
  tool: string,
  input: Record<string, unknown>
): Promise<HomelabToolResult> {
  switch (tool) {
    case "homelab_overview": {
      const queued = listDocs(PROMPT_QUEUE, {
        where: [["status", "==", "queued"]],
        orderBy: ["queuedAt", "asc"],
      }) as { title?: string }[];
      const triage = listDocs(TRIAGE_QUEUE, { where: [["status", "==", "proposed"]] });
      const approvals = listDocs(DECISION_QUEUE, { where: [["status", "==", "pending"]] });
      const goals = await getStandingGoals().catch(() => null);
      const data = {
        queuedPrompts: queued.map((q) => q.title || "untitled"),
        pendingTriageCards: triage.length,
        pendingApprovals: approvals.length,
        standingGoals: goals
          ? { total: goals.total, ok: goals.ok, violated: goals.violated }
          : "unavailable",
      };
      return {
        tool,
        summary: `Queue: ${queued.length} prompt${queued.length === 1 ? "" : "s"}, ${triage.length} triage, ${approvals.length} approvals`,
        data,
      };
    }
    case "queue_homelab_prompt": {
      const title = String(input.title ?? "").slice(0, 160);
      const prompt = String(input.prompt ?? "");
      if (!title || !prompt) {
        return { tool, summary: "Failed: title and prompt required", data: { error: "title and prompt required" }, failed: true };
      }
      const runNow = input.run_now === true;
      const id = createDoc(PROMPT_QUEUE, {
        itemId: `chat-${Date.now()}`,
        title,
        prompt,
        status: "queued",
        queuedAt: { __date: new Date().toISOString() },
        source: "chat",
        ...(runNow ? { runNowRequested: true } : {}),
      });
      // Still no launch branch (T47) — run_now only surfaces a confirm chip;
      // the launch is Samy's tap on it, never this executor.
      return {
        tool,
        summary: runNow ? `Queued "${title}" — tap Run now to launch it` : `Queued "${title}"`,
        data: {
          id,
          status: "queued",
          note: runNow
            ? "Queued with a run-now request. It launches only when Samy taps the Run now confirm in the UI — tell him to tap it."
            : "Queued only. Launch it from the /decide approve page — chat cannot start a session.",
        },
        ...(runNow ? { confirm: { promptId: id, title } } : {}),
      };
    }
    case "get_service_health": {
      const [docker, host] = await Promise.all([
        getAllContainers().catch(() => null),
        getHostMetrics().catch(() => null),
      ]);
      const containers = docker?.containers ?? [];
      const down = containers.filter((c) => !c.up).map((c) => c.label ?? c.name);
      return {
        tool,
        summary: down.length ? `${down.length} service(s) down: ${down.join(", ")}` : "All watched services up",
        data: { dockerOk: docker?.ok ?? false, containers, host },
      };
    }
    case "get_autoloop_summary": {
      const run = lastAutoloopRun();
      return {
        tool,
        summary: run.summary ? run.summary.replace(/^[\d\- :]+/, "") : "No autoloop summary found",
        data: run,
        failed: !run.summary,
      };
    }
    case "list_pending_approvals": {
      const limit = typeof input.limit === "number" && input.limit > 0 ? Math.min(input.limit, 25) : 10;
      const items = (listDocs(DECISION_QUEUE, {
        where: [["status", "==", "pending"]],
        orderBy: ["createdAt", "asc"],
      }) as unknown as DecisionItem[]).slice(0, limit);
      return {
        tool,
        summary: `${items.length} pending approval${items.length === 1 ? "" : "s"}`,
        data: items.map((i) => ({
          id: i.id,
          project: i.project,
          title: i.title,
          brief: i.brief ?? null,
        })),
      };
    }
    case "record_approval_verdict": {
      const verdict = input.verdict as DecisionVerdict;
      if (!DECISION_VERDICTS.includes(verdict)) {
        return { tool, summary: "Failed: invalid verdict", data: { error: "invalid verdict" }, failed: true };
      }
      let id = typeof input.id === "string" ? input.id : "";
      if (!id && typeof input.title === "string" && input.title.trim()) {
        const pending = listDocs(DECISION_QUEUE, {
          where: [["status", "==", "pending"]],
        }) as unknown as DecisionItem[];
        const needle = input.title.toLowerCase();
        const matches = pending.filter((p) => p.title.toLowerCase().includes(needle));
        if (matches.length !== 1) {
          return {
            tool,
            summary: `Failed: "${input.title}" matches ${matches.length} pending cards`,
            data: { error: "ambiguous or no match", candidates: matches.map((m) => m.title) },
            failed: true,
          };
        }
        id = matches[0].id;
      }
      if (!id) return { tool, summary: "Failed: no card identified", data: { error: "id or title required" }, failed: true };
      const item = getDoc(DECISION_QUEUE, id);
      if (!item) return { tool, summary: "Failed: no such card", data: { error: "no such item" }, failed: true };
      if (item.status !== "pending") {
        return { tool, summary: `Failed: card is ${item.status}`, data: { error: `item is ${item.status}` }, failed: true };
      }
      updateDoc(DECISION_QUEUE, id, {
        status: "decided",
        verdict,
        note: String(input.note ?? "").slice(0, 2000),
        decidedAt: { __date: new Date().toISOString() },
      });
      return {
        tool,
        summary: `Recorded "${verdict}" on ${String(item.title).slice(0, 60)}`,
        data: { id, verdict, note: "ROADMAP write-back happens on the nightly pass; nothing executes automatically." },
      };
    }
    case "add_learning_topic": {
      const topic = String(input.topic ?? "").trim();
      if (!topic) return { tool, summary: "Failed: no topic", data: { error: "topic required" }, failed: true };
      const mission = String(input.mission ?? "").trim();
      if (!mission) return { tool, summary: "Failed: no mission", data: { error: "mission required" }, failed: true };
      const { addTopic } = await import("./teach");
      const id = addTopic(topic, mission);
      return {
        tool,
        summary: `Queued "${topic.slice(0, 60)}" for teaching`,
        data: { id, note: "Visible in the Teach me section on /knowledge; schedule or start a session from there." },
      };
    }
    default:
      return { tool, summary: `Failed: unknown tool ${tool}`, data: { error: "unknown tool" }, failed: true };
  }
}

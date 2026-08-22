import { describe, it, expect, vi } from "vitest";
import {
  grillingTodoTitle,
  grillingTodosFor,
  shouldEnqueueGrilling,
  grillingTodoBody,
  enqueueGrillingTodo,
  type GrillingTransport,
} from "./grilling";
import type { Goal } from "./types";

const goal = (over: Partial<Goal> = {}): Goal => ({
  id: "g1",
  title: "Get strong",
  quarter: "2026-Q3",
  status: "active",
  milestones: [],
  doneMilestones: [],
  commitments: [],
  sessions: [],
  createdAt: new Date(),
  updatedAt: new Date(),
  ...over,
});

describe("grillingTodoTitle", () => {
  it("prefixes the goal title", () => {
    expect(grillingTodoTitle(goal({ title: "Get strong" }))).toBe(
      "Grilling session: Get strong"
    );
  });
});

describe("grillingTodosFor", () => {
  it("includes flagged goals with no grilledAt", () => {
    const g = goal({ needsGrilling: true });
    expect(grillingTodosFor([g])).toEqual([g]);
  });

  it("excludes grilled goals", () => {
    expect(grillingTodosFor([goal({ needsGrilling: true, grilledAt: "2026-08-20" })])).toEqual([]);
  });

  it("tolerates the absent flag (legacy goals)", () => {
    expect(grillingTodosFor([goal()])).toEqual([]);
  });
});

describe("duplicate guard", () => {
  it("blocks once grillingQueuedAt is set", () => {
    expect(shouldEnqueueGrilling(goal({ needsGrilling: true }))).toBe(true);
    expect(shouldEnqueueGrilling(goal({ needsGrilling: true, grillingQueuedAt: new Date().toISOString() }))).toBe(false);
    expect(shouldEnqueueGrilling(goal())).toBe(false);
  });

  it("enqueue refuses an already-queued goal without hitting transport", async () => {
    const transport = vi.fn();
    const r = await enqueueGrillingTodo(
      goal({ needsGrilling: true, grillingQueuedAt: "x" }),
      { transport: transport as unknown as GrillingTransport }
    );
    expect(r.queued).toBe(false);
    expect(transport).not.toHaveBeenCalled();
  });
});

describe("todoist body shape", () => {
  it("posts content + due today via an injected stub transport", async () => {
    let captured: RequestInit | undefined;
    const transport: GrillingTransport = async (_url, init) => {
      captured = init;
      return new Response(JSON.stringify({ id: "td-1" }), { status: 200 });
    };
    process.env.TODOIST_API_TOKEN = "test-token";
    const now = new Date("2026-08-22T10:00:00");
    const r = await enqueueGrillingTodo(goal({ needsGrilling: true }), { transport, now });
    expect(r).toEqual({ queued: true, taskId: "td-1" });
    expect(captured?.method).toBe("POST");
    const body = JSON.parse(String(captured?.body));
    expect(body.content).toBe("Grilling session: Get strong");
    expect(body.due_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(grillingTodoBody(goal(), now)).toEqual({
      content: "Grilling session: Get strong",
      due_date: "2026-08-22",
    });
  });
});

describe("fail-soft path", () => {
  it("returns queued:false on network failure without throwing", async () => {
    const transport: GrillingTransport = async () => {
      throw new Error("boom");
    };
    process.env.TODOIST_API_TOKEN = "test-token";
    const r = await enqueueGrillingTodo(goal({ needsGrilling: true }), { transport });
    expect(r.queued).toBe(false);
    expect(r.error).toContain("boom");
  });

  it("returns queued:false on non-2xx without throwing", async () => {
    const transport: GrillingTransport = async () =>
      new Response("nope", { status: 500 });
    process.env.TODOIST_API_TOKEN = "test-token";
    const r = await enqueueGrillingTodo(goal({ needsGrilling: true }), { transport });
    expect(r.queued).toBe(false);
  });
});

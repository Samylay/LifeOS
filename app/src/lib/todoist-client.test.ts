import { describe, it, expect } from "vitest";
import { createTodoistTask, deleteTodoistTask, type TodoistTransport } from "./todoist-client";

describe("createTodoistTask", () => {
  const originalToken = process.env.TODOIST_API_TOKEN;

  it("fails soft with no live call when no token is configured", async () => {
    delete process.env.TODOIST_API_TOKEN;
    let called = false;
    const transport: TodoistTransport = async () => {
      called = true;
      throw new Error("should not be called");
    };
    const r = await createTodoistTask({ content: "x" }, { transport });
    expect(r).toEqual({ ok: false, error: "TODOIST_API_TOKEN not set" });
    expect(called).toBe(false);
    if (originalToken) process.env.TODOIST_API_TOKEN = originalToken;
  });

  it("posts content + due and returns the created task id", async () => {
    process.env.TODOIST_API_TOKEN = "test-token";
    let captured: { url: string; init: RequestInit } | undefined;
    const transport: TodoistTransport = async (url, init) => {
      captured = { url, init };
      return new Response(JSON.stringify({ id: "task-1" }), { status: 200 });
    };
    const r = await createTodoistTask({ content: "book the bike fit", due_string: "Friday" }, { transport });
    expect(r).toEqual({ ok: true, taskId: "task-1" });
    expect(captured?.url).toContain("api.todoist.com");
    const body = JSON.parse(String(captured?.init.body));
    expect(body).toEqual({ content: "book the bike fit", due_string: "Friday" });
    expect(captured?.init.headers).toMatchObject({ Authorization: "Bearer test-token" });
    process.env.TODOIST_API_TOKEN = originalToken;
  });

  it("returns ok:false without throwing on a non-2xx response", async () => {
    process.env.TODOIST_API_TOKEN = "test-token";
    const transport: TodoistTransport = async () => new Response("nope", { status: 500 });
    const r = await createTodoistTask({ content: "x" }, { transport });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("500");
    process.env.TODOIST_API_TOKEN = originalToken;
  });

  it("returns ok:false without throwing on a network failure", async () => {
    process.env.TODOIST_API_TOKEN = "test-token";
    const transport: TodoistTransport = async () => {
      throw new Error("network down");
    };
    const r = await createTodoistTask({ content: "x" }, { transport });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("network down");
    process.env.TODOIST_API_TOKEN = originalToken;
  });
});

describe("deleteTodoistTask — T-voice-rework-05's retraction after a move", () => {
  const originalToken = process.env.TODOIST_API_TOKEN;

  it("DELETEs the task by id with the same bearer auth as create", async () => {
    process.env.TODOIST_API_TOKEN = "test-token";
    let captured: { url: string; init: RequestInit } | undefined;
    const transport: TodoistTransport = async (url, init) => {
      captured = { url, init };
      return new Response(null, { status: 204 });
    };
    const r = await deleteTodoistTask("task-1", { transport });
    expect(r).toEqual({ ok: true, taskId: "task-1" });
    expect(captured?.url).toContain("task-1");
    expect(captured?.init.method).toBe("DELETE");
    expect(captured?.init.headers).toMatchObject({ Authorization: "Bearer test-token" });
    process.env.TODOIST_API_TOKEN = originalToken;
  });

  it("treats a 404 as success — the end state (task gone) is what the caller wants", async () => {
    process.env.TODOIST_API_TOKEN = "test-token";
    const transport: TodoistTransport = async () => new Response("not found", { status: 404 });
    const r = await deleteTodoistTask("already-gone", { transport });
    expect(r.ok).toBe(true);
    process.env.TODOIST_API_TOKEN = originalToken;
  });

  it("fails soft on a network error without throwing", async () => {
    process.env.TODOIST_API_TOKEN = "test-token";
    const transport: TodoistTransport = async () => {
      throw new Error("network down");
    };
    const r = await deleteTodoistTask("task-1", { transport });
    expect(r.ok).toBe(false);
    process.env.TODOIST_API_TOKEN = originalToken;
  });

  it("fails soft with no live call when no token is configured", async () => {
    delete process.env.TODOIST_API_TOKEN;
    let called = false;
    const transport: TodoistTransport = async () => {
      called = true;
      throw new Error("should not be called");
    };
    const r = await deleteTodoistTask("task-1", { transport });
    expect(r).toEqual({ ok: false, error: "TODOIST_API_TOKEN not set" });
    expect(called).toBe(false);
    if (originalToken) process.env.TODOIST_API_TOKEN = originalToken;
  });
});

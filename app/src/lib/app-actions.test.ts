import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./server-db", () => ({
  createDoc: vi.fn(),
  listDocs: vi.fn(() => [{ id: "task-1", title: "Ship the report", status: "todo" }]),
  updateDoc: vi.fn(),
}));
vi.mock("./voice-inbox", () => ({ appendToInbox: vi.fn() }));

describe("executeAppActions task completion", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 200 })));
  });

  it("notifies the pager after completing a task", async () => {
    const { executeAppActions } = await import("./app-actions");

    await executeAppActions([{ tool: "complete_task", input: { title: "Ship the report" } }]);

    expect(fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:3000/api/notify",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          title: "Task completed",
          text: 'Completed: "Ship the report"',
          stream: "alerts",
          severity: "normal",
          source: "lifeos.task-completion",
          path: "/",
        }),
      })
    );
  });
});

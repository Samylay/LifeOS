import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "micro-studio-"));
process.env.LIFEOS_DB_PATH = path.join(temp, "test.db");
const mock = vi.hoisted(() => ({ start: vi.fn(), sessions: vi.fn() }));
vi.mock("@/lib/codex-sessions", () => ({ startCodexSession: mock.start, getCodexSessions: mock.sessions }));
const { parseBrief, buildGaps, workspaceSlug } = await import("./model");
const { createApp, readApp, saveApp, attachSession } = await import("./service");
const { createDoc, getDoc } = await import("../server-db");
const launch = await import("@/app/api/micro/apps/[id]/launch/route");
const research = await import("@/app/api/micro/apps/[id]/research/route");
const route = await import("@/app/api/micro/apps/[id]/route");
afterAll(() => fs.rmSync(temp, { recursive: true, force: true }));
const fixture = () => ({ title: "Budget app", audience: "Irregular earners", problem: "A monthly budget is hard to predict", platform: "web", features: [{ id: "income", title: "Record income", scope: "first", acceptance: "Adding income updates the available budget" }], name: "Pocket", vibe: "Quiet blue, clear amounts, short motion", references: "User-selected reference, screen IDs recorded", business: "Free first budget" });
const req = (v: unknown) => new Request("http://localhost/api/micro", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(v) });
const context = (id: string) => ({ params: Promise.resolve({ id }) });
beforeEach(() => { vi.clearAllMocks(); mock.start.mockResolvedValue({ id: "a".repeat(32), status: "starting" }); mock.sessions.mockResolvedValue([{ id: "a".repeat(32), status: "running" }]); });

describe("Micro product decisions", () => {
  it("rejects duplicate feature identity and privileged fields cannot enter a brief", () => {
    const v = fixture();
    expect(() => parseBrief({ ...v, features: [v.features[0], v.features[0]] })).toThrow("distinct");
    expect(parseBrief({ ...v, workspaceSession: "attacker", revision: 999 })).not.toHaveProperty("workspaceSession");
    expect(() => parseBrief({ ...v, platform: "shell" })).toThrow("platform");
  });
  it("requires actual first-release acceptance and does not treat later work as build scope", () => {
    expect(buildGaps(parseBrief(fixture()))).toEqual([]);
    expect(buildGaps(parseBrief({ ...fixture(), features: [{ ...fixture().features[0], scope: "later" }] }))).toContain("Pick at least one first-release feature.");
    expect(buildGaps(parseBrief({ ...fixture(), features: [{ ...fixture().features[0], acceptance: "" }] }))).toContain("Describe how to verify each first-release feature.");
  });
  it("retains identity across naming changes and refuses stale saves", () => {
    const app = createApp(fixture()); const before = workspaceSlug(app.id);
    const saved = saveApp(app.id, { ...fixture(), name: "New name" }, app.revision);
    expect(saved.id).toBe(app.id); expect(workspaceSlug(saved.id)).toBe(before);
    expect(() => saveApp(app.id, fixture(), app.revision)).toThrow("another window");
    expect(readApp(app.id).name).toBe("New name");
  });
  it("session attachment preserves concurrent product changes and unrelated collections", () => {
    const unrelated = createDoc("users/local/notes", { text: "Keep this" });
    const app = createApp(fixture());
    saveApp(app.id, { ...fixture(), name: "Chosen name" }, app.revision);
    attachSession(app.id, "researchSession", "b".repeat(32));
    expect(readApp(app.id).name).toBe("Chosen name");
    expect(readApp(app.id).revision).toBe(2);
    expect(getDoc("users/local/notes", unrelated)?.text).toBe("Keep this");
  });
});
describe("Micro session boundaries", () => {
  it("refuses cross-site and simple text requests before launching an agent", async () => {
    const app = createApp(fixture());
    const hostile = new Request("http://localhost/api/micro", { method: "POST", headers: { "content-type": "application/json", origin: "https://unrelated.example" }, body: JSON.stringify({ revision: 1 }) });
    expect((await launch.POST(hostile, context(app.id))).status).toBe(403);
    const simple = new Request("http://localhost/api/micro", { method: "POST", body: JSON.stringify({ revision: 1 }) });
    expect((await launch.POST(simple, context(app.id))).status).toBe(415);
    expect(mock.start).not.toHaveBeenCalled();
  });
  it("does not launch a build with incomplete decisions or a stale brief", async () => {
    const app = createApp({ ...fixture(), name: "" });
    expect((await launch.POST(req({ revision: 0 }), context(app.id))).status).toBe(409);
    expect((await launch.POST(req({ revision: 1 }), context(app.id))).status).toBe(400);
    expect(mock.start).not.toHaveBeenCalled();
  });
  it("launches only the initializer at an immutable allowed path, and repeated clicks reuse the session", async () => {
    const app = createApp(fixture());
    expect((await launch.POST(req({ revision: 1 }), context(app.id))).status).toBe(200);
    const prompt = mock.start.mock.calls[0][1];
    expect(prompt).toContain(`/home/quorky/apps/micro/${workspaceSlug(app.id)}`);
    expect(prompt).toContain("No GitHub repo creation");
    expect(prompt).toContain("without implementing or publishing");
    expect((await launch.POST(req({ revision: 1 }), context(app.id))).status).toBe(200);
    expect(mock.start).toHaveBeenCalledTimes(1);
  });
  it("research uses AppLlama with a bounded read-only scope and does not start concurrent research", async () => {
    const app = createApp(fixture());
    expect((await research.POST(req({ revision: 1 }), context(app.id))).status).toBe(200);
    expect(mock.start.mock.calls[0][1]).toContain("Appllama MCP");
    expect(mock.start.mock.calls[0][1]).toContain("12 paid calls");
    expect(mock.start.mock.calls[0][1]).toContain("no code, file or service changes");
    await research.POST(req({ revision: 1 }), context(app.id));
    expect(mock.start).toHaveBeenCalledTimes(1);
  });
  it("can explicitly retry a failed workspace without changing the target", async () => {
    const app = createApp(fixture()); attachSession(app.id, "workspaceSession", "c".repeat(32));
    mock.sessions.mockResolvedValue([{ id: "c".repeat(32), status: "failed" }]);
    await launch.POST(req({ revision: 1 }), context(app.id));
    expect(mock.start.mock.calls[0][2]).toContain("c".repeat(32));
    expect(mock.start.mock.calls[0][1]).toContain(workspaceSlug(app.id));
  });
  it("API preserves a winning edit when another tab saves stale data", async () => {
    const app = createApp(fixture());
    const first = await route.PUT(req({ revision: 1, brief: { ...fixture(), name: "Winner" } }), context(app.id));
    const stale = await route.PUT(req({ revision: 1, brief: fixture() }), context(app.id));
    expect(first.status).toBe(200); expect(stale.status).toBe(409); expect(readApp(app.id).name).toBe("Winner");
  });
  it("rejects an oversized request before any session starts", async () => {
    const app = createApp(fixture());
    expect((await launch.POST(req({ revision: 1, pad: "x".repeat(65000) }), context(app.id))).status).toBe(413);
    expect(mock.start).not.toHaveBeenCalled();
  });
});

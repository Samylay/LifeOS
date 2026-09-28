import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock("@/lib/claude-cli", () => ({ generateReadOnlyJson: mock.generate }));
const { POST } = await import("@/app/api/micro/suggest/route");

const context = {
  title: "Budgeting app", audience: "People who want to organize spending", problem: "Bad financial decisions",
  platform: "android", features: [{ title: "", scope: "first" }], business: "Basic budgeting features",
};
function request(value: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/micro/suggest", {
    method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(value),
  });
}
beforeEach(() => mock.generate.mockReset());

describe("Micro draft suggestions", () => {
  it("suggests concrete problems from an unfinished brief without saving it", async () => {
    mock.generate.mockResolvedValue({ suggestions: ["They cannot tell which recurring expenses leave less money for essentials."] });
    const response = await POST(request({ kind: "problem", context: { ...context, references: "Private note that must stay out of the prompt" } }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ suggestions: ["They cannot tell which recurring expenses leave less money for essentials."] });
    const prompt = mock.generate.mock.calls[0][0] as string;
    expect(prompt).toContain("Budgeting app");
    expect(prompt).not.toContain("Private note");
  });

  it("returns editable feature ideas with observable acceptance and scope", async () => {
    const idea = { title: "Categorize spending", reason: "Shows where money goes", acceptance: "After adding an expense, its category total updates", scope: "first" };
    mock.generate.mockResolvedValue({ suggestions: [idea] });
    const response = await POST(request({ kind: "features", context }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ suggestions: [idea] });
    expect(mock.generate.mock.calls[0][0]).toContain("Avoid duplicating existing features");
  });

  it("can suggest a problem from a feature-first draft", async () => {
    mock.generate.mockResolvedValue({ suggestions: ["They cannot see where monthly expenses exceed their intended limits."] });
    const firstFeature = { ...context, title: "", audience: "", problem: "", features: [{ title: "Categorize expenses", scope: "first" }] };
    expect((await POST(request({ kind: "problem", context: firstFeature }))).status).toBe(200);
    expect(mock.generate.mock.calls[0][0]).toContain("Categorize expenses");
  });

  it("rejects invalid ideas, empty context and cross-site requests", async () => {
    mock.generate.mockResolvedValue({ suggestions: [{ title: "Track money", reason: "Useful", acceptance: "", scope: "first" }] });
    expect((await POST(request({ kind: "features", context }))).status).toBe(502);
    mock.generate.mockClear();
    expect((await POST(request({ kind: "problem", context: { ...context, title: "", audience: "", problem: "" } }))).status).toBe(400);
    expect((await POST(request({ kind: "problem", context }, { origin: "https://unrelated.example" }))).status).toBe(403);
    expect(mock.generate).not.toHaveBeenCalled();
  });
});

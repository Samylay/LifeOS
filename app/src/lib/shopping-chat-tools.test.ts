import { describe, it, expect, afterAll, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

const { startCodexSession, getCodexSessions } = vi.hoisted(() => ({ startCodexSession: vi.fn(), getCodexSessions: vi.fn() }));
vi.mock("./codex-sessions", () => ({ startCodexSession, getCodexSessions }));

// Throwaway DB before the lazy singleton opens (mirrors homelab-tools.dispatch.test.ts).
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lifeos-shopping-chat-test-"));
process.env.LIFEOS_DB_PATH = path.join(tmpDir, "test.db");

const { APP_TOOLS } = await import("./agent-engine");
const { executeAppActions } = await import("./app-actions");
const { HOMELAB_TOOL_NAMES, HOMELAB_TOOL_STATUS, executeHomelabTool } = await import("./homelab-tools");
const { createPantryItem, listEntries, listPantry } = await import("./shopping");

afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

const toolNames = APP_TOOLS.map((t) => (t.type === "function" ? t.function.name : ""));

describe("shopping chat tools", () => {
  it("exposes add and bought as app tools and resolve as a server tool", () => {
    expect(toolNames).toEqual(expect.arrayContaining(["add_to_shopping_list", "mark_groceries_bought"]));
    expect(HOMELAB_TOOL_NAMES.has("resolve_pantry_item")).toBe(true);
    expect(HOMELAB_TOOL_STATUS.resolve_pantry_item).toBeTruthy();
  });

  it("adds items as said and reports when an alias was applied", async () => {
    createPantryItem({ name: "Alpha", aliases: ["alias a"], category: "dairy" });
    const [result] = await executeAppActions([{ tool: "add_to_shopping_list", input: { items: [{ name: "alias a", quantity: 2 }, { name: "Zulu" }] } }]);
    expect(result).toMatchObject({ tool: "add_to_shopping_list", count: 2 });
    expect(result.summary).toContain('"alias a" as Alpha');
    expect(listEntries().map((e) => [e.text, e.source]).sort()).toEqual([["Alpha", "assistant"], ["Zulu", "assistant"]]);
  });

  it("marks bought, clears the list and refuses to guess an unclear name", async () => {
    createPantryItem({ name: "Bravo variant" });
    const results = await executeAppActions([{ tool: "mark_groceries_bought", input: { items: [{ name: "alias a" }, { name: "Zulu" }, { name: "bravo" }] } }]);
    expect(results[0]).toMatchObject({ count: 2, summary: "Moved to the pantry: Alpha, Zulu (new)" });
    expect(results[1]).toMatchObject({ failed: true });
    expect(results[1].summary).toContain("Bravo variant");
    expect(listEntries()).toEqual([]);
    expect(listPantry().find((i) => i.name === "Alpha")?.inStock).toBe(true);
  });

  it("resolves a term for the model without changing anything", async () => {
    const hit = await executeHomelabTool("resolve_pantry_item", { term: "Alias A" });
    expect(hit).toMatchObject({ data: { item: { name: "Alpha" }, via: "alias" } });
    const unclear = await executeHomelabTool("resolve_pantry_item", { term: "bravo" });
    expect(unclear.data).toMatchObject({ item: null, candidates: [{ name: "Bravo variant" }] });
    expect((await executeHomelabTool("resolve_pantry_item", {})).failed).toBe(true);
  });
});

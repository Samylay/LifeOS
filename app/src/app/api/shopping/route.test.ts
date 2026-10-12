import { describe, it, expect, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import type { NextRequest } from "next/server";

// Point the lazy singleton DB at a throwaway file before importing anything
// that opens it (mirrors server-db.test.ts).
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lifeos-shopping-route-test-"));
process.env.LIFEOS_DB_PATH = path.join(tmpDir, "test.db");

const { createPantryItem } = await import("@/lib/shopping");
const { GET, POST, PATCH, DELETE } = await import("./route");

afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

function req(method: string, body?: unknown): NextRequest {
  return new Request("http://localhost/api/shopping", {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
  }) as unknown as NextRequest;
}

describe("/api/shopping", () => {
  it("adds typed text, resolving an alias to its pantry item", async () => {
    const item = createPantryItem({ name: "Item A", aliases: ["alias a"], category: "dairy", inStock: true });
    const res = await POST(req("POST", { text: "2 alias a, item b" }));
    expect(res.status).toBe(200);
    const { added } = await res.json();
    expect(added).toHaveLength(2);
    expect(added[0]).toMatchObject({ said: "alias a", resolvedVia: "alias", entry: { itemId: item.id, text: "Item A", quantity: 2, category: "dairy" } });
    expect(added[1]).toMatchObject({ resolvedVia: null, entry: { itemId: null, text: "item b", category: "other" } });
  });

  it("lists entries and the pantry together", async () => {
    const data = await (await GET()).json();
    expect(data.entries.map((e: { text: string }) => e.text).sort()).toEqual(["Item A", "item b"]);
    expect(data.pantry.map((i: { name: string }) => i.name)).toEqual(["Item A"]);
  });

  it("checks an entry and rejects a non-boolean", async () => {
    const { entries } = await (await GET()).json();
    const res = await PATCH(req("PATCH", { id: entries[0].id, checked: true }));
    expect((await res.json()).entry.checked).toBe(true);
    expect((await PATCH(req("PATCH", { id: entries[0].id, checked: "yes" }))).status).toBe(400);
    expect((await PATCH(req("PATCH", { id: "missing", checked: true }))).status).toBe(404);
  });

  it("adds low-stock pantry items once", async () => {
    createPantryItem({ name: "Item C", inStock: false });
    const first = await (await POST(req("POST", { lowStock: true }))).json();
    expect(first.added.map((a: { entry: { text: string; source: string } }) => [a.entry.text, a.entry.source])).toEqual([["Item C", "low-stock"]]);
    expect((await (await POST(req("POST", { lowStock: true }))).json()).added).toEqual([]);
  });

  it("removes an entry", async () => {
    const { entries } = await (await GET()).json();
    const target = entries.find((e: { text: string }) => e.text === "item b");
    expect((await DELETE(req("DELETE", { id: target.id }))).status).toBe(200);
    expect((await (await GET()).json()).entries.some((e: { id: string }) => e.id === target.id)).toBe(false);
  });

  it("rejects malformed bodies", async () => {
    expect((await POST(req("POST", "not json"))).status).toBe(400);
    expect((await POST(req("POST", { nothing: true }))).status).toBe(400);
    expect((await POST(req("POST", { items: [{ name: "" }] }))).status).toBe(400);
  });
});

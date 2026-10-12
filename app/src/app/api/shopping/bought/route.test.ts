import { describe, it, expect, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import type { NextRequest } from "next/server";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lifeos-shopping-bought-test-"));
process.env.LIFEOS_DB_PATH = path.join(tmpDir, "test.db");

const { addEntries, createPantryItem, setEntryChecked } = await import("@/lib/shopping");
const { POST } = await import("./route");

afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

function req(body: unknown): NextRequest {
  return new Request("http://localhost/api/shopping/bought", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

describe("POST /api/shopping/bought", () => {
  it("buys every checked entry by default and returns the new state", async () => {
    const item = createPantryItem({ name: "Item A", unit: "g", inStock: false });
    const [a, b] = addEntries([{ name: "item a", quantity: 1, unit: "kg" }, { name: "item b", quantity: null, unit: null }]);
    setEntryChecked(a.entry.id, true);
    const res = await POST(req({}));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.bought).toHaveLength(1);
    expect(data.pantry.find((i: { id: string }) => i.id === item.id)).toMatchObject({ inStock: true, quantity: 1000 });
    expect(data.entries.map((e: { id: string }) => e.id)).toEqual([b.entry.id]);
  });

  it("buys named ids even when unchecked, creating a pantry item from free text", async () => {
    const [entry] = addEntries([{ name: "Item D", quantity: 3, unit: null }]);
    const data = await (await POST(req({ ids: [entry.entry.id] }))).json();
    expect(data.bought[0]).toMatchObject({ created: true, item: { name: "Item D", quantity: 3, inStock: true } });
  });

  it("rejects bad ids", async () => {
    expect((await POST(req({ ids: "all" }))).status).toBe(400);
    expect((await POST(req({ ids: ["missing"] }))).status).toBe(404);
  });
});

import { describe, it, expect, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import type { NextRequest } from "next/server";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lifeos-pantry-route-test-"));
process.env.LIFEOS_DB_PATH = path.join(tmpDir, "test.db");

const { GET, POST, PATCH, DELETE } = await import("./route");

afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

function req(method: string, body: unknown): NextRequest {
  return new Request("http://localhost/api/pantry", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

describe("/api/pantry", () => {
  it("creates an item with aliases and nutrition", async () => {
    const res = await POST(req("POST", { name: "Item A", aliases: ["alias a"], unit: "ml", category: "dairy", nutrition: { basis: "100ml", values: { calcium: 120 } } }));
    expect(res.status).toBe(201);
    expect((await res.json()).item).toMatchObject({ name: "Item A", aliases: ["alias a"], unit: "ml", inStock: false, nutrition: { values: { calcium: 120 } } });
  });

  it("moves an alias only after the owner lets it go", async () => {
    const b = (await (await POST(req("POST", { name: "Item B" }))).json()).item;
    const conflict = await PATCH(req("PATCH", { id: b.id, aliases: ["alias a"] }));
    expect(conflict.status).toBe(409);
    expect((await conflict.json()).error).toContain("Item A");
    const a = (await (await GET()).json()).pantry.find((i: { name: string }) => i.name === "Item A");
    await PATCH(req("PATCH", { id: a.id, aliases: [] }));
    expect((await (await PATCH(req("PATCH", { id: b.id, aliases: ["alias a"] }))).json()).item.aliases).toEqual(["alias a"]);
  });

  it("validates fields and deletes", async () => {
    expect((await POST(req("POST", { name: "Item C", unit: "cup" }))).status).toBe(400);
    expect((await POST(req("POST", { name: "Item C", minQuantity: -1 }))).status).toBe(400);
    const { pantry } = await (await GET()).json();
    expect((await DELETE(req("DELETE", { id: pantry[0].id }))).status).toBe(200);
    expect((await DELETE(req("DELETE", { id: pantry[0].id }))).status).toBe(404);
  });
});

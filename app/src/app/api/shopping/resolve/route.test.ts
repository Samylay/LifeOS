import { describe, it, expect, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { NextRequest } from "next/server";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lifeos-shopping-resolve-test-"));
process.env.LIFEOS_DB_PATH = path.join(tmpDir, "test.db");

const { createPantryItem } = await import("@/lib/shopping");
const { GET } = await import("./route");

afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

const req = (term?: string) => new NextRequest(`http://localhost/api/shopping/resolve${term === undefined ? "" : `?term=${encodeURIComponent(term)}`}`);

describe("GET /api/shopping/resolve", () => {
  it("resolves the default alias and a longer name to different items", async () => {
    const a = createPantryItem({ name: "Alpha", aliases: ["alias a"] });
    const b = createPantryItem({ name: "Bravo alias a" });
    expect(await (await GET(req("Alias A"))).json()).toMatchObject({ item: { id: a.id }, via: "alias" });
    expect(await (await GET(req("bravo alias a"))).json()).toMatchObject({ item: { id: b.id }, via: "name" });
  });

  it("returns candidates without a match for a partial term", async () => {
    const data = await (await GET(req("bravo"))).json();
    expect(data.item).toBeNull();
    expect(data.candidates.map((c: { name: string }) => c.name)).toEqual(["Bravo alias a"]);
  });

  it("requires a term", async () => {
    expect((await GET(req())).status).toBe(400);
  });
});

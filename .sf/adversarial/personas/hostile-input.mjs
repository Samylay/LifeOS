// hostile-input persona: stored XSS + oversized/odd input through UI and data API (sandbox only).
import { startPersona } from "../lib.mjs";
import fs from "node:fs";
import path from "node:path";
const BASE = process.env.SF_BASE_URL ?? "http://127.0.0.1:3124";
const XSS = ['<img src=x onerror=alert(1)>', '"><svg onload=alert(2)>', '[x](javascript:alert(3))', '‮evil​‍text 😀🧑‍💻', "'; DROP TABLE docs;--"];
const p = await startPersona("hostile-input");
const dialogs = [];
p.page.on("dialog", async (d) => { dialogs.push({ type: d.type(), msg: d.message(), url: p.page.url() }); await d.dismiss().catch(() => {}); });
const post = (u, b, m = "POST") => fetch(BASE + u, { method: m, headers: { "content-type": "application/json" }, body: JSON.stringify(b) }).then((r) => r.status);

// Seed hostile docs through the same store the UI reads.
const sid = "hostile-sess";
for (const [i, x] of XSS.entries()) {
  await post("/api/data/users/local/chatMessages", { clientId: sid, idx: 9000 + i, role: i % 2 ? "assistant" : "user", text: x, createdAt: { __date: new Date().toISOString() } });
  await post("/api/data/users/local/tasks", { title: x, priority: "medium", status: "todo", area: x });
  await post("/api/data/users/local/habits", { name: x, frequency: "daily", status: "active", streak: -5, history: {} });
  await post("/api/data/users/local/recipes", { name: x, notes: x, steps: [x], ingredients: [x], servings: -1, kcalPerServing: NaN, tags: [x] });
  await post("/api/shopping", { text: x });
}
await post("/api/data/users/local/habits", { name: "x".repeat(10000), frequency: "daily", status: "active", streak: 1e308, history: {} });
await post("/api/data/users/local/chatMessages", { clientId: sid, idx: 9100, role: "user", text: "[a](javascript:alert(9)) [b](JaVaScRiPt:alert(9)) " + "y".repeat(10000), createdAt: { __date: "2026-02-30T00:00:00Z" } });

const routes = ["/", "/chat", "/decide", "/decide/approvals", "/decide/calibrate", "/decide/dispatch", "/decide/extracts", "/finance", "/knowledge/teach", "/pager", "/saved", "/settings", "/settings/habits", "/shopping", "/status", "/workflows", "/workouts"];
for (const r of routes) { await p.go(r); await p.page.waitForTimeout(500); }

// Type into visible text fields on key pages.
for (const r of ["/shopping", "/chat", "/settings/habits", "/settings", "/"]) {
  await p.go(r);
  const inputs = p.page.locator("input[type=text], input:not([type]), textarea");
  const n = Math.min(await inputs.count(), 4);
  for (let i = 0; i < n; i++) {
    const el = inputs.nth(i);
    if (!(await el.isVisible().catch(() => false))) continue;
    for (const v of [XSS[0], XSS[1], "z".repeat(10000), "-1e999 NaN 2026-02-30"]) {
      await el.fill(v).catch(() => {});
      await el.press("Enter").catch(() => {});
      await p.page.waitForTimeout(250);
    }
  }
  await p.shot("typed" + r.replace(/\//g, "_"));
}
// Page-level DOM check for injected live elements.
const injected = await p.page.evaluate(() => document.querySelectorAll("img[src=x], svg[onload]").length);
p.step("dialogs=" + JSON.stringify(dialogs) + " injected=" + injected);
p.journal.dialogs = dialogs;
const dir = await p.finish();
const root = path.dirname(dir);
fs.writeFileSync(path.join(root, "dialogs.json"), JSON.stringify(dialogs, null, 2));
console.log("dialogs", dialogs.length, "dir", dir);

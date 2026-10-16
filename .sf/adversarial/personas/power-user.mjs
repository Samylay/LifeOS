// Persona: power-user. Fast desktop user: bursts of writes, then cross-check via API.
import { startPersona, VIEWPORTS } from "../lib.mjs";
import fs from "node:fs";
import path from "node:path";
const B = process.env.SF_BASE_URL ?? "http://127.0.0.1:3122";
const p = await startPersona("power-user", { viewport: VIEWPORTS.desktop });
const obs = [];
const note = (k, v) => { obs.push({ k, v }); p.step(`${k}: ${JSON.stringify(v)}`); };
const api = async (m, u, body) => { const r = await fetch(B + u, { method: m, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined }); const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t.slice(0, 200); } return { s: r.status, j }; };
const page = p.page;
try {
  // 1. page load timings
  const timings = {};
  for (const r of ["/", "/chat", "/decide", "/finance", "/saved", "/settings", "/settings/habits", "/shopping", "/status", "/workouts"]) {
    const t = Date.now(); await p.go(r); timings[r] = Date.now() - t;
  }
  note("loadMs", timings);

  // 2. Shopping rapid add via UI
  await p.go("/shopping");
  const add = page.getByLabel("Add to the list");
  const names = Array.from({ length: 12 }, (_, i) => `qa item ${i}`);
  for (const n of names) { await add.fill(n); await add.press("Enter"); }
  await page.waitForTimeout(1500);
  const uiCount = await page.getByText(/qa item \d+/).count();
  let st = (await api("GET", "/api/shopping")).j;
  const got = st.entries.filter((e) => /^qa item/.test(e.text));
  note("shopping12", { ui: uiCount, api: got.length });
  await p.shot("shopping-burst");
  if (got.length !== 12 || uiCount !== 12) p.finding({ id: "shop-burst", note: "count mismatch", ui: uiCount, api: got.length });
  // dupes?
  note("shoppingDupes", got.length - new Set(got.map((e) => e.text)).size);
  // rapid check/uncheck via API concurrently + delete
  await Promise.all(got.slice(0, 6).map((e) => api("PATCH", "/api/shopping", { id: e.id, checked: true })));
  await Promise.all(got.slice(6, 9).map((e) => api("DELETE", "/api/shopping", { id: e.id })));
  st = (await api("GET", "/api/shopping")).j;
  const g2 = st.entries.filter((e) => /^qa item/.test(e.text));
  note("afterBulk", { total: g2.length, checked: g2.filter((e) => e.checked).length });
  await page.reload({ waitUntil: "networkidle" });
  note("uiAfterReload", await page.getByText(/qa item \d+/).count());
  // concurrent duplicate add
  const dup = await Promise.all(Array.from({ length: 5 }, () => api("POST", "/api/shopping", { text: "qa dup milk" })));
  st = (await api("GET", "/api/shopping")).j;
  note("concurrentSameAdd", { statuses: dup.map((d) => d.s), rows: st.entries.filter((e) => /qa dup milk/.test(e.text)).map((e) => e.quantity) });
  // delete nonexistent twice / double delete
  const victim = g2[g2.length - 1];
  const dd = await Promise.all([api("DELETE", "/api/shopping", { id: victim.id }), api("DELETE", "/api/shopping", { id: victim.id })]);
  note("doubleDelete", dd.map((d) => d.s));

  // 3. Pantry
  await p.go("/shopping");
  const tabs = await page.getByRole("tab").allTextContents(); note("tabs", tabs.length);
  const pc = await Promise.all(Array.from({ length: 10 }, (_, i) => api("POST", "/api/pantry", { name: `qa pantry ${i}`, unit: "unit", quantity: i, minQuantity: 5 })));
  note("pantryCreate", pc.map((x) => x.s));
  let pan = (await api("GET", "/api/pantry")).j.pantry.filter((x) => /^qa pantry/.test(x.name));
  note("pantryCount", pan.length);
  // concurrent patches of the same item (lost update?)
  const it = pan[0];
  await Promise.all([api("PATCH", "/api/pantry", { id: it.id, quantity: 1 }), api("PATCH", "/api/pantry", { id: it.id, inStock: false }), api("PATCH", "/api/pantry", { id: it.id, minQuantity: 9 })]);
  const after = (await api("GET", "/api/pantry")).j.pantry.find((x) => x.id === it.id);
  note("pantryConcurrentPatch", { quantity: after.quantity, inStock: after.inStock, min: after.minQuantity });
  // low stock badge/list sync
  const ls = await api("POST", "/api/shopping", { lowStock: true });
  note("lowStock", { s: ls.s, n: ls.j?.added?.length });
  const ls2 = await api("POST", "/api/shopping", { lowStock: true });
  note("lowStockAgain", { s: ls2.s, n: ls2.j?.added?.length });
  // delete a pantry item that is listed
  const del = await api("DELETE", "/api/pantry", { id: pan[1].id });
  st = (await api("GET", "/api/shopping")).j;
  note("deletePantryListed", { s: del.s, orphanEntries: st.entries.filter((e) => e.itemId === pan[1].id).length });
  // bought flow
  const ent = st.entries.find((e) => e.itemId);
  if (ent) {
    const bs = await Promise.all([api("POST", "/api/shopping/bought", { id: ent.id }), api("POST", "/api/shopping/bought", { id: ent.id })]);
    note("boughtTwice", bs.map((x) => ({ s: x.s })));
    const pi = (await api("GET", "/api/pantry")).j.pantry.find((x) => x.id === ent.itemId);
    note("pantryAfterBought", { q: pi?.quantity, inStock: pi?.inStock });
  }
  await p.go("/shopping"); await p.shot("pantry");

  // 4. Meals (nutrition) - find write API
  const chatRes = await api("GET", "/api/data/users/local/foodLog");
  note("foodLogRead", { s: chatRes.s });

  // 5. Finance overrides
  await p.go("/finance"); await p.shot("finance");
  const keys = ["qa-a", "qa-b", "qa-c", "qa-d"];
  const fo = await Promise.all(keys.flatMap((k) => ["fixed", "sub", "variable"].map((kind) => api("POST", "/api/finance/overrides", { merchantKey: k, kind }))));
  note("financeBurst", fo.map((x) => x.s).join(","));
  const bad = await api("POST", "/api/finance/overrides", { merchantKey: "x", kind: "nope" }); note("financeBad", bad.s);

  // 6. Keyboard shortcuts
  await p.go("/");
  const sbW = async () => page.evaluate(() => { const el = document.querySelector("[data-sidebar], aside, nav"); return el ? Math.round(el.getBoundingClientRect().width) : null; });
  const w0 = await sbW();
  await page.keyboard.press("Control+b"); await page.waitForTimeout(500);
  const w1 = await sbW();
  await page.keyboard.press("Control+b"); await page.waitForTimeout(500);
  const w2 = await sbW();
  for (let i = 0; i < 6; i++) await page.keyboard.press("Control+b");
  await page.waitForTimeout(600);
  note("sidebar", { w0, w1, w2, afterEven: await sbW() });
  // ctrl+b inside an input (chat)
  await p.go("/chat");
  const ta = page.locator("textarea, input[type=text]").first();
  await ta.click(); await ta.fill("hello"); await page.keyboard.press("Control+b"); await page.waitForTimeout(300);
  note("chatCtrlBValue", await ta.inputValue());

  // 7. Assistant rapid messages
  const sends = [];
  for (let i = 0; i < 3; i++) {
    await ta.fill(`qa ping ${i}`); await page.keyboard.press("Enter"); await page.waitForTimeout(200);
  }
  await page.waitForTimeout(8000);
  const userBubbles = await page.getByText(/qa ping \d/).count();
  note("chatBubbles", userBubbles);
  await p.shot("chat-burst");
  const hist = await api("GET", "/api/chat/history"); note("chatHistory", { s: hist.s, shape: typeof hist.j === "object" ? Object.keys(hist.j) : hist.j });
  const hs = JSON.stringify(hist.j); note("pingsPersisted", (hs.match(/qa ping \d/g) || []).length);
  await page.reload({ waitUntil: "networkidle" });
  note("pingsAfterReload", await page.getByText(/qa ping \d/).count());

  // 8. Two tabs same page
  const p2 = await p.context.newPage();
  await p.go("/shopping"); await p2.goto(B + "/shopping", { waitUntil: "networkidle" });
  await page.getByLabel("Add to the list").fill("qa tab one"); await page.getByLabel("Add to the list").press("Enter");
  await p2.getByLabel("Add to the list").fill("qa tab two"); await p2.getByLabel("Add to the list").press("Enter");
  await page.waitForTimeout(1000);
  const t1 = await page.getByText(/qa tab (one|two)/).count();
  const t2 = await p2.getByText(/qa tab (one|two)/).count();
  st = (await api("GET", "/api/shopping")).j;
  note("twoTabs", { tab1: t1, tab2: t2, api: st.entries.filter((e) => /qa tab/.test(e.text)).length });
  await p2.reload({ waitUntil: "networkidle" });
  note("twoTabsAfterReload", await p2.getByText(/qa tab (one|two)/).count());
  await p2.close();

  // 9. back/forward
  await p.go("/shopping"); await p.go("/finance"); await p.go("/chat");
  await page.goBack(); await page.goBack(); await page.goForward();
  note("backfwd", page.url());

  // 10. Decide
  await p.go("/decide"); await p.shot("decide");
  note("decideQueue", (await api("GET", "/api/triage/queue")).j?.items?.length);
  await page.keyboard.press("ArrowRight"); await page.keyboard.press("ArrowLeft");
  // habits
  await p.go("/settings/habits"); await p.shot("habits");
  // cleanup
  st = (await api("GET", "/api/shopping")).j;
  for (const e of st.entries.filter((e) => /^qa /.test(e.text) || /qa pantry/.test(e.text))) await api("DELETE", "/api/shopping", { id: e.id });
} catch (e) { note("SCRIPT_ERROR", String(e).slice(0, 300)); }
const dir = await p.finish();
fs.writeFileSync(path.join(dir, "observations.json"), JSON.stringify(obs, null, 2));
console.log(dir); for (const o of obs) console.log(o.k, JSON.stringify(o.v));

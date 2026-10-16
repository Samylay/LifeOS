// Persona: slow-network. Bad mobile link: throttled CDP, offline mid-action, 5xx, 10 s stalls.
// Synthetic input only. Results go to $SF_EVIDENCE_DIR/slow-network/results.json (shape data, no page text).
import { startPersona, VIEWPORTS } from "../lib.mjs";
import fs from "node:fs";
import path from "node:path";

const p = await startPersona("slow-network", { slowNetwork: true, viewport: VIEWPORTS.phone, touch: true, mobile: true });
const { page, context } = p;
const results = { ttfmc: {}, tests: [] };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const toasts = () => page.evaluate(() => [...document.querySelectorAll("[data-sonner-toast]")].map((t) => t.getAttribute("data-type") + ":" + (t.textContent || "").length));
const alerts = () => page.evaluate(() => [...document.querySelectorAll("[role=alert]")].map((t) => (t.textContent || "").length));
const record = (name, o) => { results.tests.push({ name, ...o }); p.step(`${name}: ${JSON.stringify(o)}`); };
// NOTE harness: context.setOffline is ignored while lib.mjs CDP throttling is active (fetch still succeeds), so offline = abort every /api call (fetch rejects "Failed to fetch").
const goOffline = () => page.route("**/api/**", (r) => r.abort("internetdisconnected"));
async function unroute() { await page.unrouteAll({ behavior: "ignoreErrors" }).catch(() => {}); await context.setOffline(false); }
const fail500 = (match, method) => page.route(match, (r) => (!method || r.request().method() === method) ? r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "boom" }) }) : r.fallback());
const stall = (match, method, ms = 10000) => page.route(match, async (r) => { if (method && r.request().method() !== method) return r.fallback(); await sleep(ms); r.continue().catch(() => {}); });

// 1. Time to first meaningful content per page (slow network, cold load).
const pages = ["/", "/chat", "/decide", "/decide/approvals", "/finance", "/knowledge/teach", "/pager", "/saved", "/settings", "/settings/habits", "/shopping", "/status", "/workflows", "/workouts"];
for (const route of pages) {
  await page.goto("about:blank").catch(() => {});
  const t0 = Date.now();
  const base = process.env.SF_BASE_URL;
  const nav = page.goto(base + route, { waitUntil: "commit" });
  await nav.catch(() => {});
  const tCommit = Date.now() - t0;
  // first meaningful = main text >= 80 chars and no skeleton/shimmer; polled with try/catch (navigation resets the context)
  let tMeaningful = null, tGone = null;
  while (Date.now() - t0 < 90000) {
    const st = await page.evaluate(() => { const m = document.querySelector("main") || document.body; const text = (m?.innerText || "").trim(); return { len: text.length, sk: document.querySelectorAll("[class*=animate-pulse], [class*=shimmer]").length }; }).catch(() => null);
    if (st && st.len >= 80 && tMeaningful === null) tMeaningful = Date.now() - t0;
    if (st && st.len >= 80 && st.sk === 0) { tGone = Date.now() - t0; break; }
    await sleep(150);
  }
  const ok = tMeaningful !== null;
  results.ttfmc[route] = { commitMs: tCommit, textVisibleMs: tMeaningful, contentSettledMs: tGone, timedOut: tGone === null };
  p.step(`ttfmc ${route} ${JSON.stringify(results.ttfmc[route])}`);
}

try {
// 2. Shopping
await p.go("/shopping");
const add = page.getByLabel("Add to the list");
async function addItem(text) { await add.fill(text); await add.press("Enter"); }
async function sampleAdd(label) {
  const out = {};
  for (const [k, ms] of [["t0.4s", 400], ["t3s", 2600], ["t12s", 9000]]) { await sleep(ms); out[k] = { toasts: await toasts(), addDisabled: await page.getByRole("button", { name: "Add" }).first().isDisabled().catch(() => null), inputLen: (await add.inputValue().catch(() => "")).length }; }
  return out;
}
// 2a add under 5xx
await fail500("**/api/shopping", "POST");
await addItem("zz-synthetic-a");
record("shopping.add.500", { samples: await sampleAdd(), rowAdded: await page.getByText("zz-synthetic-a").count() });
await unroute();
await p.shot("shopping-add-500");
// 2b add success (slow net)
await add.fill("zz-synthetic-b"); const t1 = Date.now(); await add.press("Enter");
await page.getByRole("checkbox", { name: /zz-synthetic-b/i }).waitFor({ timeout: 30000 }).catch(() => {});
record("shopping.add.slow-ok", { rowAppearedMs: Date.now() - t1 });
await sleep(1500);
await page.getByLabel("Add to the list").fill("");
const row = () => page.getByRole("checkbox", { name: /zz-synthetic-b/i });
// 2c toggle under 500
await fail500("**/api/shopping", "PATCH");
const before = await row().getAttribute("aria-checked");
const tc = Date.now(); await row().click(); const immediate = await row().getAttribute("aria-checked"); const immMs = Date.now() - tc;
await sleep(3500);
const after = await row().getAttribute("aria-checked");
record("shopping.toggle.500", { before, immediate, immMs, afterRollback: after, toasts: await toasts() });
await p.shot("shopping-toggle-500");
await unroute();
// 2d toggle offline
await sleep(5000);
await goOffline();
const b2 = await row().getAttribute("aria-checked"); await row().click(); const i2 = await row().getAttribute("aria-checked");
await sleep(2500);
record("shopping.toggle.offline", { before: b2, immediate: i2, after: await row().getAttribute("aria-checked"), toasts: await toasts() });
await p.shot("shopping-toggle-offline");
// 2e add offline
await add.fill("zz-synthetic-c"); await add.press("Enter"); await sleep(2500);
record("shopping.add.offline", { toasts: await toasts(), inputKept: (await add.inputValue()).length, rowAdded: await page.getByText("zz-synthetic-c").count() });
await context.setOffline(false);
await sleep(4000);
// 2f toggle with 10s stall: optimistic feedback, then reload mid-flight
await stall("**/api/shopping", "PATCH", 10000);
const b3 = await row().getAttribute("aria-checked"); await row().click();
record("shopping.toggle.stall10s", { before: b3, immediate: await row().getAttribute("aria-checked") });
await sleep(11500);
record("shopping.toggle.stall10s.after", { state: await row().getAttribute("aria-checked"), toasts: await toasts() });
await unroute();
// 2g load failure then recover
await fail500("**/api/shopping", "GET");
await page.reload({ waitUntil: "domcontentloaded" }); await sleep(6000);
record("shopping.load.500", { alerts: await alerts(), retryButton: await page.getByRole("button", { name: /retry|try again/i }).count() });
await p.shot("shopping-load-500");
await unroute();
await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
await sleep(5000);
record("shopping.load.recover-on-visibility", { rowBack: await page.getByRole("checkbox").count(), alerts: await alerts() });
// 2h load stall 10s: skeleton shown?
await stall("**/api/shopping", "GET", 10000);
await page.reload({ waitUntil: "domcontentloaded" }); await sleep(4000);
record("shopping.load.stall10s", { skeletons: await page.locator("[class*=animate-pulse]").count(), alerts: await alerts() });
await unroute();
// cleanup synthetic rows
await page.waitForTimeout(8000);


} catch (e) { record('section-error', { msg: String(e.message).slice(0,200) }); await unroute(); }
try {
// 3. Habits on home
await p.go("/");
const habitBtn = page.locator("button[aria-label^='Complete'], button[aria-label^='Mark incomplete']").first();
if (await habitBtn.count()) {
  await fail500("**/api/data/**", "PATCH");
  const lab0 = await habitBtn.getAttribute("aria-label");
  await habitBtn.click(); await sleep(300);
  const lab1 = await habitBtn.getAttribute("aria-label").catch(() => null);
  await sleep(3500);
  record("habit.toggle.500", { labelBefore: lab0?.split(";")[0], labelImmediate: lab1?.split(";")[0], labelAfter: (await habitBtn.getAttribute("aria-label"))?.split(";")[0], toasts: await toasts(), alerts: await alerts() });
  await p.shot("habit-toggle-500");
  await unroute(); await sleep(4000);
  await goOffline();
  const l0 = await habitBtn.getAttribute("aria-label"); await habitBtn.click(); await sleep(300);
  const l1 = await habitBtn.getAttribute("aria-label"); await sleep(3000);
  record("habit.toggle.offline", { before: l0?.split(";")[0], immediate: l1?.split(";")[0], after: (await habitBtn.getAttribute("aria-label"))?.split(";")[0], toasts: await toasts() });
  await context.setOffline(false);
  await sleep(3000);
  await stall("**/api/data/**", "PATCH", 10000);
  const s0 = await habitBtn.getAttribute("aria-label"); await habitBtn.click(); await sleep(400);
  const disabled = await habitBtn.isDisabled(); const labelDuring = (await habitBtn.getAttribute("aria-label"))?.split(";")[0];
  await sleep(11000);
  record("habit.toggle.stall10s", { before: s0?.split(";")[0], disabledDuring: disabled, labelDuring, after: (await habitBtn.getAttribute("aria-label"))?.split(";")[0] });
  await unroute();
} else record("habit.toggle", { skipped: "no habit button" });


} catch (e) { record('section-error', { msg: String(e.message).slice(0,200) }); await unroute(); }
try {
// 4. Chat send
await p.go("/chat");
const box = page.locator("textarea").first();
const chatState = () => page.evaluate(() => ({ bubbles: document.querySelectorAll("main [class*=rounded]").length, text: (document.body.innerText || "").length, alerts: document.querySelectorAll("[role=alert]").length }));
async function send(text) { await box.fill(text); await box.press("Enter"); }
await fail500("**/api/chat", "POST");
const c0 = await chatState(); await send("synthetic ping one"); await sleep(400);
const c1 = await chatState(); await sleep(6000);
record("chat.send.500", { userBubbleImmediate: await page.getByText("synthetic ping one").count(), delta0: c1.text - c0.text, retryBtn: await page.getByRole("button", { name: /retry|try again|resend/i }).count(), errorText: await page.getByText(/couldn.t|could not|error|failed|try again/i).count(), lastMsgs: await page.evaluate(() => [...document.querySelectorAll("main p, main [role=status]")].slice(-3).map(e => (e.textContent||"").slice(0,120))), toasts: await toasts(), inputRestored: (await box.inputValue()).length });
await p.shot("chat-500");
await unroute();
await goOffline();
await send("synthetic ping two"); await sleep(4000);
record("chat.send.offline", { lastMsgs: await page.evaluate(() => [...document.querySelectorAll("main p, main [role=status]")].slice(-3).map(e => (e.textContent||"").slice(0,120))), userBubble: await page.getByText("synthetic ping two").count(), retryBtn: await page.getByRole("button", { name: /retry|try again|resend/i }).count(), errorText: await page.getByText(/offline|network|couldn.t|could not|failed|try again/i).count(), toasts: await toasts() });
await p.shot("chat-offline");
await context.setOffline(false); await sleep(1500);
await stall("**/api/chat", "POST", 10000);
await send("synthetic ping three"); await sleep(3000);
record("chat.send.stall10s", { userBubble: await page.getByText("synthetic ping three").count(), stopBtn: await page.getByRole("button", { name: /stop/i }).count(), typingIndicator: await page.locator("[class*=animate]").count() });
await p.shot("chat-stall");
await sleep(9000); await unroute();


} catch (e) { record('section-error', { msg: String(e.message).slice(0,200) }); await unroute(); }
try {
// 5. Decide approve
await p.go("/decide");
const appr = () => page.getByRole("button", { name: "Approve", exact: true });
const td = Date.now(); await appr().first().waitFor({ timeout: 120000 }).catch(() => {}); record("decide.load.approve-visible-ms", { ms: Date.now() - td });
const sig = () => page.evaluate(() => (document.querySelector("main")?.innerText || "").length + ":" + document.querySelectorAll("main li, main article").length);
record("decide.approve.present", { count: await appr().count(), sig: await sig() });
if (await appr().count()) {
  await fail500("**/api/**", "POST"); await fail500("**/api/**", "PATCH"); await fail500("**/api/**", "PUT");
  const s0 = await sig(); await appr().first().click(); await sleep(400);
  const s1 = await sig(); await sleep(4000);
  record("decide.approve.500", { sigBefore: s0, sigImmediate: s1, sigAfter: await sig(), toasts: await toasts(), alerts: await alerts() });
  await p.shot("decide-approve-500");
  await unroute();
  await goOffline();
  const s2 = await sig(); if (await appr().count()) { await appr().first().click(); await sleep(3000); }
  record("decide.approve.offline", { sigBefore: s2, sigAfter: await sig(), toasts: await toasts(), alerts: await alerts() });
  await p.shot("decide-approve-offline");
  await unroute();
  await sleep(1500);
  await stall("**/api/**", undefined, 10000);
  const s3 = await sig(); if (await appr().count()) { await appr().first().click(); await sleep(1500); }
  record("decide.approve.stall10s", { sigBefore: s3, sigAt1_5s: await sig(), toasts: await toasts() });
  await sleep(10000); record("decide.approve.stall10s.after", { sig: await sig(), toasts: await toasts() });
  await unroute();
}
} catch (e) { record('section-error', { msg: String(e.message).slice(0,200) }); await unroute(); }
try {
// 5b. Request volume / payload on /decide, 30 s window, throttled
{
  const counts = {}; const sizes = {};
  page.on("response", async (r) => { const u = r.url().replace(/^.*127.0.0.1:\d+/, "").split("?")[0]; if (!u.startsWith("/api")) return; counts[u] = (counts[u] || 0) + 1; const b = await r.body().catch(() => null); if (b) sizes[u] = Math.max(sizes[u] || 0, b.length); });
  await page.goto(process.env.SF_BASE_URL + "/decide", { waitUntil: "commit" }); await sleep(30000);
  record("decide.requests30s", { counts, maxBytes: sizes });
}
// 6. Meal log (nutrition-log) card + offline recovery on a main page
await p.go("/workouts");
await goOffline(); await sleep(500);
await page.getByRole("tab").nth(1).click().catch(() => {}); await sleep(2000);
record("workouts.tab.offline", { alerts: await alerts(), textLen: (await page.evaluate(() => document.body.innerText.length)) });
await context.setOffline(false);
await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange"))); await sleep(3000);
await p.shot("workouts-recover");


} catch (e) { record('section-error', { msg: String(e.message).slice(0,200) }); await unroute(); }
try {
// 7. Page hang check: stall every API 10s on home
await stall("**/api/**", undefined, 10000);
const th = Date.now(); await page.goto(process.env.SF_BASE_URL + "/", { waitUntil: "commit" });
await sleep(3000);
record("home.stall-all-api", { shellVisibleAt3s: await page.evaluate(() => (document.body.innerText || "").length), skeletons: await page.locator("[class*=animate-pulse]").count() });
await p.shot("home-stalled");
await unroute();


} catch (e) { record('section-error', { msg: String(e.message).slice(0,200) }); await unroute(); }
const dir = await p.finish();
fs.writeFileSync(path.join(path.dirname(dir), "results.json"), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 1));
process.exit(0);

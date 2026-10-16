// Persona: careless-user. A distracted desktop user (1280x800) who double/triple clicks,
// hits shortcuts by accident, escapes dialogs with unsaved input and never reads toasts.
// Run against a FRESH sandbox:  SF_SANDBOX_NAME=careless-user SF_SANDBOX_PORT=3123 .sf/bin/sandbox start
//   SF_BASE_URL=http://127.0.0.1:3123 node .sf/adversarial/personas/careless-user.mjs
// Findings are data: the script exits 0. Each run records which findings it observed in
// $SF_EVIDENCE_DIR/careless-user/runs.json; findings.json's reproCount is the number of runs.
import fs from "node:fs";
import path from "node:path";
import { startPersona, VIEWPORTS, BASE } from "../lib.mjs";

const EVID = path.join(process.env.SF_EVIDENCE_DIR ?? path.join(process.env.HOME, "apps/lifeos-sf-field-data/evidence"), "careless-user");
const p = await startPersona("careless-user", { viewport: VIEWPORTS.desktop });
const { page } = p;
const obs = {}; // id -> { ...facts }
const seen = (id, facts) => { obs[id] = facts; p.step(`finding ${id}`, facts); };
const writes = [];
page.on("response", async (r) => { if (r.request().method() !== "GET") writes.push({ m: r.request().method(), s: r.status(), u: r.url().replace(BASE, "").split("?")[0] }); });
const take = (re) => writes.splice(0).filter((w) => re.test(w.u));
const api = async (u, init) => { const r = await fetch(BASE + u, init); return r.json().catch(() => ({})); };
const post = (u, body) => api(u, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const toasts = async () => (await page.locator("[data-sonner-toast]").allInnerTexts()).map((t) => t.trim());
const pending = async () => (await api("/api/decide/queue")).items.length;
const attempt = async (name, fn) => { try { await fn(); } catch (e) { p.step(`journey ${name} aborted: ${String(e.message).split("\n")[0]}`); } };

// J1: triple-click Approve on an Inbox approval card (desktop master-detail).
await attempt("triple-approve", async () => {
  await p.go("/decide?tab=agents");
  const before = await pending();
  take(/./);
  await page.getByRole("button", { name: /^Approve/ }).first().click({ clickCount: 3, delay: 5 });
  await page.waitForTimeout(1500);
  const w = take(/decide\/verdict/);
  const t = await toasts();
  const errs = p.journal.pageErrors.filter((e) => /not pending/.test(e.message)).length;
  const after = await pending();
  await p.shot("triple-approve");
  const body = await page.locator("body").innerText();
  const hasUndo = /undo/i.test(body) || t.some((x) => /undo/i.test(x));
  p.step("triple-approve result", { posts: w.map((x) => x.s), before, after, toasts: t.length, unhandledRejections: errs, hasUndo });
  if (w.length >= 2 && w.some((x) => x.s === 409)) seen("CU-02", { verdictPosts: w.map((x) => x.s), unhandledRejections: errs, toasts: t.length });
  if (before - after === 1 && t.length === 0 && !hasUndo) seen("CU-01", { decidedDelta: before - after, toasts: t.length, hasUndo });
});

// J2: accidental browser/OS shortcuts on the Inbox page record verdicts.
await attempt("shortcuts", async () => {
  await p.go("/decide");
  await page.locator("body").click({ position: { x: 640, y: 30 } });
  const b0 = await pending(); take(/./);
  await page.keyboard.press("Control+a"); // select-all intent
  await page.waitForTimeout(1200);
  const a = take(/decide\/verdict/);
  const b1 = await pending();
  await page.keyboard.press("Control+x"); // cut intent
  await page.waitForTimeout(1200);
  const x = take(/decide\/verdict/);
  const b2 = await pending();
  await p.shot("after-ctrl-keys");
  p.step("shortcut result", { ctrlA: a.map((w) => w.s), ctrlX: x.map((w) => w.s), b0, b1, b2 });
  if (a.length && x.length && b0 - b2 === 2) seen("CU-03", { ctrlA: "approved one card", ctrlX: "rejected one card", pendingBefore: b0, pendingAfter: b2 });
  // key held down
  take(/./);
  for (let i = 0; i < 4; i++) await page.keyboard.down("a");
  await page.keyboard.up("a");
  await page.waitForTimeout(1500);
  const held = take(/decide\/verdict/);
  p.step("held key", { posts: held.map((w) => w.s) });
});

// J3: Don't suggest / Add tag on Saved proposals: permanent, silent.
await attempt("proposals", async () => {
  await p.go("/decide?tab=saved");
  const before = (await api("/api/proposals")).items.length;
  take(/./);
  await page.getByRole("button", { name: "Don't suggest" }).click();
  await page.waitForTimeout(1200);
  const w = take(/proposals\/verdict/);
  const t = await toasts();
  const after = (await api("/api/proposals")).items.length;
  const body = await page.locator("body").innerText();
  await p.shot("dont-suggest");
  if (w[0]?.s === 200 && t.length === 0 && !/undo|restore/i.test(body) && after === before - 1) seen("CU-05", { posts: w.map((x) => x.s), toasts: 0, before, after });
});

// J4: Topic duplicates via the learning-goal form (triple-click Add to queue).
await attempt("teach", async () => {
  await p.go("/knowledge/teach");
  await page.getByLabel("Add learning topic").click();
  await page.getByRole("textbox", { name: "Topic" }).fill("synthetic goal careless");
  await page.getByRole("textbox", { name: "Mission" }).fill("synthetic mission");
  take(/./);
  await page.getByRole("button", { name: "Add to queue" }).click({ clickCount: 3, delay: 5 });
  await page.waitForTimeout(1500);
  const w = take(/\/teach$/);
  const t = await toasts();
  const dup = (await api("/api/teach")).topics.filter((x) => x.topic === "synthetic goal careless").length;
  await p.shot("teach-triple");
  const noDelete = !/delete|remove/i.test(await page.locator("body").innerText());
  if (dup >= 2) seen("CU-04", { posts: w.length, topicsCreated: dup, successToasts: t.length, anyDeleteControl: !noDelete });
});

// J5: Topic proposal accepted three times (stale card, double tap): API level.
await attempt("topic-proposal", async () => {
  const rs = await Promise.all([1, 2, 3].map(() => post("/api/proposals/verdict", { id: "topic:zzcluster", action: "accept", mission: "synthetic mission" })));
  const n = (await api("/api/teach")).topics.filter((x) => x.topic === "Learn about zzcluster").length;
  p.step("topic proposal x3", { statuses: rs.map((r) => (r.ok ? 200 : 400)), topics: n });
  if (n >= 2) seen("CU-06", { acceptCalls: 3, topicsCreated: n });
});

// J6: pantry Delete and list Remove.
await attempt("shopping", async () => {
  await p.go("/shopping");
  await page.getByLabel("Add to the list").fill("zzlist item");
  await page.getByLabel("Add to the list").press("Enter");
  await page.waitForTimeout(600);
  await page.getByRole("button", { name: /^Pantry/ }).click();
  await page.getByLabel("Add to the pantry").fill("zzpantry item");
  await page.getByLabel("Add to the pantry").press("Enter");
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: "zzpantry item" }).first().click();
  await page.getByRole("textbox", { name: "Also called" }).fill("zzalias");
  await page.getByRole("button", { name: "Save" }).click();
  await page.waitForTimeout(600);
  await page.getByRole("button", { name: "zzpantry item" }).first().click();
  take(/./);
  await page.getByRole("button", { name: "Delete" }).click(); // one click, no confirm
  await page.waitForTimeout(900);
  const w = take(/pantry/);
  const t = await toasts();
  const left = (await api("/api/shopping")).pantry.length;
  await p.shot("pantry-delete");
  if (w[0]?.m === "DELETE" && w[0].s === 200 && left === 0 && !t.some((x) => /undo/i.test(x))) seen("CU-07", { posts: w.map((x) => x.m + x.s), toast: t[0] ?? null, dialog: await page.locator("[role=dialog],[role=alertdialog]").count() });
  await page.getByRole("button", { name: /^List/ }).click();
  take(/./);
  await page.getByRole("button", { name: "Remove zzlist item" }).click();
  await page.waitForTimeout(700);
  const rw = take(/shopping/);
  const rt = await toasts();
  if (rw[0]?.m === "DELETE" && rw[0].s === 200 && !rt.some((x) => /undo/i.test(x))) seen("CU-10", { posts: rw.map((x) => x.m + x.s), toastsAfterRemove: rt.length });
});

// J7: Settings "Send test" reports success although push failed.
await attempt("settings-test", async () => {
  await p.go("/settings");
  await page.locator("summary", { hasText: "Notifications" }).click();
  let body;
  page.once("response", async (r) => { if (r.url().endsWith("/api/notify") && r.request().method() === "POST") body = await r.json().catch(() => null); });
  await page.getByRole("button", { name: "Send test" }).click();
  await page.waitForTimeout(2500);
  const t = await toasts();
  await p.shot("send-test");
  if (body?.push === "error" && t.some((x) => /Test sent/.test(x))) seen("CU-08", { apiPush: body.push, toast: t[0].split("\n")[0] });
});

// J8: habit editor sheet: Escape / outside click drop typed input silently.
await attempt("habit-escape", async () => {
  await p.go("/settings/habits");
  const add = page.getByRole("button", { name: "Add habit" }).first();
  await add.click(); await page.waitForTimeout(400);
  await page.locator("[role=dialog] input").first().fill("synthetic unsaved habit");
  await page.keyboard.press("Escape"); await page.waitForTimeout(500);
  const closed1 = (await page.locator("[role=dialog]").count()) === 0;
  await add.click(); await page.waitForTimeout(400);
  const kept = await page.locator("[role=dialog] input").first().inputValue();
  await page.locator("[role=dialog] input").first().fill("synthetic unsaved habit 2");
  await page.mouse.click(30, 400); await page.waitForTimeout(500);
  const closed2 = (await page.locator("[role=dialog]").count()) === 0;
  await p.shot("habit-escape");
  if (closed1 && closed2 && kept === "") seen("CU-09", { escapeClosedWithoutPrompt: closed1, outsideClickClosedWithoutPrompt: closed2, draftKeptOnReopen: kept !== "" });
});

// J9: chat: draft lost on navigation; huge paste overflows the bubble.
await attempt("chat", async () => {
  await p.go("/chat");
  const box = page.getByPlaceholder("Message LifeOS…");
  await box.fill("half typed synthetic note");
  await page.goto(BASE + "/shopping"); await page.goBack(); await page.waitForTimeout(1500);
  const draft = await page.getByPlaceholder("Message LifeOS…").inputValue();
  if (draft === "") seen("CU-11", { draftAfterBack: "empty" });
  await page.getByPlaceholder("Message LifeOS…").fill("x".repeat(20000));
  await page.getByRole("button", { name: "Send message" }).click();
  await page.waitForTimeout(4000);
  const o = await page.evaluate(() => { const el = [...document.querySelectorAll("p,div")].filter((e) => /^x{500}/.test(e.textContent || "")).pop(); if (!el) return null; const par = el.closest("[class*=rounded]"); return { sw: el.scrollWidth, cw: par?.clientWidth ?? 0 }; });
  await p.shot("chat-huge");
  p.step("chat overflow probe", o ?? {});
  if (o && o.sw > o.cw + 4) seen("CU-12", o);
});

const dir = await p.finish();

// Merge this run into runs.json and write findings.json
fs.mkdirSync(EVID, { recursive: true });
const runsFile = path.join(EVID, "runs.json");
const runs = fs.existsSync(runsFile) ? JSON.parse(fs.readFileSync(runsFile, "utf8")) : [];
const shotsOf = (...n) => n.map((s) => path.join(dir, s));
runs.push({ at: new Date().toISOString(), dir, seen: obs });
fs.writeFileSync(runsFile, JSON.stringify(runs, null, 2));
const R = (id) => runs.filter((r) => r.seen[id]).length;
const ev = (...n) => [...shotsOf(...n), path.join(dir, "journal.json")];
const F = [
  { id: "CU-01", sev: "S2", title: "Inbox approval verdict has no confirmation, toast or Undo on desktop (restore API exists but is not wired)", route: "/decide", steps: ["Open /decide?tab=agents at 1280x800", "Click Approve on the selected NEEDS-USER card once"], expected: "A toast confirming the verdict with an Undo, or a confirm step. The /api/decide/restore endpoint exists for exactly this.", actual: "Card vanishes, no toast, no Undo, decided items appear nowhere in the UI. Phone deck CardStack also passes no undo for agents.", ev: ev("01-triple-approve.redacted.png") },
  { id: "CU-02", sev: "S3", title: "Triple-clicking Approve sends 3 verdict POSTs; the 409s are unhandled promise rejections with no user feedback", route: "/decide", steps: ["Open /decide?tab=agents", "Triple-click Approve (or hold the a key)"], expected: "One request, button disabled while in flight, or a handled error.", actual: "1x 200 then 2x 409 'item is decided, not pending'; decideAgent is called with void and no catch, so page errors fire and nothing is shown.", ev: ev("01-triple-approve.redacted.png") },
  { id: "CU-03", sev: "S2", title: "Ctrl+A (select all) records an Approve and Ctrl+X (cut) records a Reject on the Inbox page", route: "/decide", steps: ["Open /decide at desktop width, click on blank page area", "Press Ctrl+A, then Ctrl+X"], expected: "Modifier combos ignored; destructive verdicts need a deliberate action.", actual: "Ctrl+A POSTs verdict approved, Ctrl+X POSTs rejected for the selected card; the keydown handler checks event.key only (no ctrl/meta/alt guard). No toast, no Undo. A held key repeats and works through the list.", ev: ev("02-after-ctrl-keys.redacted.png") },
  { id: "CU-04", sev: "S2", title: "Triple-click on 'Add to queue' creates 3 duplicate learning topics, and topics cannot be deleted", route: "/knowledge/teach", steps: ["Open /knowledge/teach, click Add a learning goal", "Fill Topic and Mission with synthetic text", "Triple-click Add to queue"], expected: "One topic; button disabled while saving; a way to remove a duplicate.", actual: "3 POST /api/teach, 3 topics with the same name, 3 success toasts. No delete or archive control and no delete action in /api/teach, so duplicates are permanent.", ev: ev("03-teach-triple.redacted.png") },
  { id: "CU-05", sev: "S3", title: "'Don't suggest' permanently tombstones a tag with no confirmation, toast or undo (same silence on 'Add tag')", route: "/decide?tab=saved", steps: ["Open /decide?tab=saved", "Click Don't suggest on a tag proposal"], expected: "Confirmation or an Undo toast; a visible result since the API says 'never asked again'.", actual: "Card disappears, no toast, nothing to reverse it in the UI.", ev: ev("02-dont-suggest.redacted.png") },
  { id: "CU-06", sev: "S2", title: "Accepting the same topic proposal repeatedly creates duplicate topics (server has no idempotency)", route: "POST /api/proposals/verdict", steps: ["POST {id:'topic:zzcluster',action:'accept',mission:'m'} three times (parallel)", "GET /api/teach"], expected: "One topic; later accepts report already accepted.", actual: "3 topics 'Learn about zzcluster'. The UI Start topic button has no in-flight guard, so a double click reaches this (topic cards need 3 clustered saved items; the sandbox is in reference mode so the card was not reachable from the UI).", ev: ev() },
  { id: "CU-07", sev: "S3", title: "Pantry item Delete is one click: no confirm, no Undo, aliases and thresholds lost", route: "/shopping (Pantry)", steps: ["Add a pantry item, set an alias, reopen it", "Click Delete"], expected: "Confirm dialog or an Undo toast.", actual: "Immediate DELETE 200 and a plain 'Removed ... from the pantry' toast with no action.", ev: ev("04-pantry-delete.redacted.png") },
  { id: "CU-08", sev: "S3", title: "Settings 'Send test' toasts 'Test sent, check your phone' while the API reported push: error", route: "/settings", steps: ["Open Settings, Notifications", "Click Send test"], expected: "Toast reflects that push delivery failed.", actual: "Success toast whenever HTTP is 200; the push field in the response body is ignored.", ev: ev("05-send-test.redacted.png") },
  { id: "CU-09", sev: "S3", title: "Habit editor sheet closes on Escape or outside click and silently discards typed input", route: "/settings/habits", steps: ["Click Add habit, type a name", "Press Escape (or click outside)", "Reopen"], expected: "Discard prompt or the draft kept.", actual: "Sheet closes, field empty on reopen, no prompt.", ev: ev("06-habit-escape.redacted.png") },
  { id: "CU-10", sev: "S4", title: "Shopping list Remove (x) has no Undo or feedback", route: "/shopping", steps: ["Add an item", "Click its Remove button"], expected: "Undo toast.", actual: "Row disappears at once, DELETE 200, no toast.", ev: ev("04-pantry-delete.redacted.png") },
  { id: "CU-11", sev: "S4", title: "Assistant message draft is lost when navigating away and back", route: "/chat", steps: ["Type text in the composer without sending", "Open /shopping then press Back"], expected: "Draft restored.", actual: "Composer empty.", ev: ev() },
  { id: "CU-12", sev: "S4", title: "Pasting a long unbroken string overflows the user message bubble", route: "/chat", steps: ["Paste 20,000 'x' characters and send"], expected: "Text wraps or truncates inside the bubble.", actual: "Text runs past the bubble edge (no word-break).", ev: ev("07-chat-huge.redacted.png") },
];
const out = F.filter((f) => R(f.id) > 0).map((f) => ({ id: f.id, title: f.title, severity: f.sev, route: f.route, steps: f.steps, expected: f.expected, actual: f.actual, reproCount: R(f.id), reproCommand: "SF_SANDBOX_NAME=careless-user SF_SANDBOX_PORT=3123 .sf/bin/sandbox start; SF_BASE_URL=http://127.0.0.1:3123 node .sf/adversarial/personas/careless-user.mjs  (fresh sandbox each time)", evidence: f.ev.filter((x) => !/\.png$/.test(x) || /redacted/.test(x)) }));
fs.writeFileSync(path.join(EVID, "findings.json"), JSON.stringify(out, null, 2));
fs.writeFileSync(path.join(EVID, "unconfirmed.json"), JSON.stringify([
  { note: "Phone-width agent deck (CardStack) passes no undo prop, so the toast after an approve has no Undo action (not exercised, desktop persona)." },
  { note: "Garmin connect failure returns HTTP 401 for a DNS failure and the UI shows only 'Failed to connect' (sandbox has no network)." },
], null, 2));
console.log("findings:", out.map((f) => `${f.id}:${f.reproCount}`).join(" "));

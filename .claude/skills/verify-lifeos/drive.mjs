#!/usr/bin/env node
// verify-lifeos driver: drives the LifeOS sandbox like a user and prints PASS/FAIL per
// feature journey. Usage (from the worktree root, sandbox started):
//   node .claude/skills/verify-lifeos/drive.mjs --list
//   node .claude/skills/verify-lifeos/drive.mjs --feature shopping [--viewport phone]
//   node .claude/skills/verify-lifeos/drive.mjs --all [--viewport phone|desktop|both]
// Exit 0 only when every selected journey passes. Evidence: $SF_EVIDENCE_DIR/verify-lifeos/.
import { startPersona, VIEWPORTS, BASE } from "../../../.sf/adversarial/lib.mjs";
import fs from "node:fs";
import path from "node:path";

const PROBE = "sf probe zz"; // synthetic item text, never real data

// Every page journey: the h1 renders, no uncaught page error, no 5xx from the app,
// no horizontal overflow. `act` adds the feature's own user path and end-state checks.
const FEATURES = {
  today: { route: "/", heading: "Today" },
  inbox: { route: "/decide", heading: "Inbox" },
  assistant: { route: "/chat", heading: "Assistant" },
  training: { route: "/workouts", heading: "Training" },
  money: { route: "/finance", heading: "Money" },
  system: { route: "/status", heading: "System" },
  settings: { route: "/settings", heading: "Settings" },
  habits: { route: "/settings/habits", heading: "Habits" },
  saved: { route: "/saved", heading: "Saved" },
  teach: { route: "/knowledge/teach", heading: "Teach" },
  // A habit whose `history` is not an array (the generic data API accepts any shape)
  // must not take down the pages that list habits. Field-test finding HI-1.
  "habits-malformed": {
    route: "/settings/habits", heading: "Habits",
    async before() {
      const res = await fetch(`${BASE}/api/data/users/local/habits`, { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: PROBE, frequency: "daily", status: "active", streak: 1, history: {} }) });
      return (await res.json()).id;
    },
    async act(p, check) {
      const res = await p.go("/");
      check("Today still renders with a malformed habit", await p.page.getByRole("heading", { level: 1, name: "Today" }).first().waitFor({ timeout: 8000 }).then(() => true, () => false), String(res?.status()));
    },
    async after(id) { if (id) await fetch(`${BASE}/api/data/users/local/habits/${encodeURIComponent(id)}`, { method: "DELETE" }); },
  },
  // Browser and OS shortcuts (Ctrl+A, Ctrl+X, Cmd+A, Alt+X) must never record an
  // Inbox verdict; the plain single-key shortcut still must. Finding CU-03.
  "inbox-shortcuts": {
    route: "/decide?tab=agents", heading: "Inbox", only: "desktop", // shortcuts exist from 1024 px up
    async act(p, check) {
      const posts = [];
      p.page.on("request", (r) => { if (r.method() !== "GET" && /\/api\/(decide|triage|proposals|workflows)/.test(r.url())) posts.push(r.url().replace(BASE, "")); });
      const cards = await p.page.getByRole("button", { name: /^Approve/ }).count();
      check("an agent card is selected (precondition)", cards > 0, `${cards} approve buttons`);
      await p.page.locator("main").click({ position: { x: 5, y: 5 } }).catch(() => {});
      for (const combo of ["Control+a", "Control+x", "Meta+a", "Alt+x", "Control+d"]) await p.page.keyboard.press(combo);
      await p.page.waitForTimeout(800);
      check("modifier shortcuts record no verdict", posts.length === 0, posts.join(", "));
      await p.page.keyboard.press("d");
      await p.page.waitForTimeout(800);
      check("plain d still defers the selected card", posts.length === 1, posts.join(", "));
    },
  },
  shopping: {
    route: "/shopping", heading: "Shopping",
    async act(p, check) {
      const api = async () => (await (await fetch(`${BASE}/api/shopping`)).json()).entries ?? [];
      const field = p.page.getByRole("textbox", { name: "Add to the list" });
      await field.fill(PROBE);
      await field.press("Enter");
      const row = p.page.getByRole("checkbox", { name: new RegExp(PROBE) });
      await row.waitFor({ timeout: 5000 });
      p.step("added probe item through the add field");
      const listed = (await api()).filter((e) => String(e.text).includes(PROBE));
      check("probe item persisted once (GET /api/shopping)", listed.length === 1, `found ${listed.length}`);
      await row.click();
      await p.page.waitForFunction((t) => [...document.querySelectorAll('[role=checkbox]')].some((b) => b.textContent.includes(t) && b.getAttribute("aria-checked") === "true"), PROBE, { timeout: 5000 }).catch(() => {});
      const checked = (await api()).find((e) => String(e.text).includes(PROBE));
      check("checking the row persists checked=true", checked?.checked === true, JSON.stringify(checked?.checked));
      await p.shot("shopping-checked");
      await p.page.getByRole("button", { name: `Remove ${checked?.text ?? PROBE}` }).first().click();
      await p.page.waitForTimeout(800);
      const left = (await api()).filter((e) => String(e.text).includes(PROBE));
      check("remove deletes the entry (GET /api/shopping)", left.length === 0, `left ${left.length}`);
    },
  },
};

async function runJourney(name, viewportName) {
  const f = FEATURES[name];
  const p = await startPersona(`verify-lifeos/${name}-${viewportName}`, { viewport: VIEWPORTS[viewportName] });
  const checks = [];
  const check = (what, ok, detail = "") => checks.push({ what, ok: Boolean(ok), detail });
  let seeded;
  try {
    if (f.before) seeded = await f.before();
    const res = await p.go(f.route);
    check(`GET ${f.route} is 200`, res?.status() === 200, String(res?.status()));
    const h1 = p.page.getByRole("heading", { level: 1, name: f.heading });
    check(`h1 "${f.heading}" renders`, await h1.first().waitFor({ timeout: 8000 }).then(() => true, () => false));
    const overflow = await p.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check("no horizontal overflow", overflow <= 0, `${overflow}px`);
    if (f.act) await f.act(p, check);
    await p.shot(`${name}-end`);
  } catch (e) {
    check("journey ran without throwing", false, String(e.message).split("\n")[0]);
  } finally {
    if (f.after) await f.after(seeded).catch(() => {});
    const own5xx = p.journal.badResponses.filter((r) => r.status >= 500 && !OFFLINE_5XX.some((re) => re.test(r.url)));
    check("no 5xx from the app", own5xx.length === 0, own5xx.map((r) => `${r.status} ${r.url.replace(BASE, "")}`).join(", "));
    check("no uncaught page error", p.journal.pageErrors.length === 0, p.journal.pageErrors.map((e) => e.message).join(" | ").slice(0, 200));
    p.journal.checks = checks;
    await p.finish();
  }
  return { name, viewport: viewportName, pass: checks.every((c) => c.ok), checks, evidence: p.dir };
}

// Routes whose 5xx means "the external service is unreachable", which the sandbox
// guarantees. Each entry is a documented, deliberate gap, not a pass.
const OFFLINE_5XX = [/\/api\/codex\/sessions$/];

const args = process.argv.slice(2);
if (args.includes("--self-test")) {
  // The gate must be able to fail: a journey on a missing page has to FAIL.
  FEATURES._missing = { route: "/__sf_missing__", heading: "Nothing" };
  const r = await runJourney("_missing", "desktop");
  console.log(r.pass ? "SELF-TEST FAILED: a missing page passed" : "self-test OK: the missing page failed as it must");
  process.exit(r.pass ? 1 : 0);
}
if (args.includes("--list")) { for (const [k, f] of Object.entries(FEATURES)) console.log(`${k}\t${f.route}`); process.exit(0); }
const vp = args[args.indexOf("--viewport") + 1] && args.includes("--viewport") ? args[args.indexOf("--viewport") + 1] : "desktop";
const viewports = vp === "both" ? ["desktop", "phone"] : [vp];
const names = args.includes("--all") ? Object.keys(FEATURES) : [args[args.indexOf("--feature") + 1]];
if (!names[0] || names.some((n) => !FEATURES[n])) { console.error(`unknown feature. Known: ${Object.keys(FEATURES).join(", ")}`); process.exit(2); }

const results = [];
for (const v of viewports) for (const n of names) {
  if (FEATURES[n].only && FEATURES[n].only !== v) { console.log(`N/A ${n} ${v} (exists only at ${FEATURES[n].only} width; not counted)`); continue; }
  const r = await runJourney(n, v);
  results.push(r);
  console.log(`${r.pass ? "PASS" : "FAIL"} ${n} ${v}${r.pass ? "" : "  " + r.checks.filter((c) => !c.ok).map((c) => `${c.what} (${c.detail})`).join("; ")}`);
}
const out = path.join(path.dirname(results[0].evidence), "..", "summary-latest.json");
fs.writeFileSync(out, JSON.stringify({ base: BASE, at: new Date().toISOString(), results }, null, 2));
const failed = results.filter((r) => !r.pass).length;
console.log(`verify-lifeos: ${results.length - failed}/${results.length} journeys passed. Summary: ${out}`);
process.exit(failed ? 1 : 0);

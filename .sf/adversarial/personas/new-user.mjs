// Persona: new-user. First-time desktop visitor, one useful action per main destination.
// Writes observed.json (ids of confirmed symptoms for this run) next to journal.json.
import { startPersona, VIEWPORTS } from "../lib.mjs";
import fs from "node:fs";
import path from "node:path";

const p = await startPersona("new-user", { viewport: VIEWPORTS.desktop });
const page = p.page;
const BASE = process.env.SF_BASE_URL;
const obs = {};
const note = (id, ok, detail = "") => { obs[id] = { ok: Boolean(ok), detail }; p.step(`check ${id}: ${ok ? "SYMPTOM SEEN" : "not seen"} ${detail}`); };
const text = () => page.evaluate(() => document.body.innerText.replace(/\s+/g, " "));
const settle = (ms = 1200) => page.waitForTimeout(ms);
const bodies = [];
page.on("response", async (r) => {
  if (/\/api\/(notify|garmin\/connect|teach|garmin\/workouts)/.test(r.url()) && r.request().method() !== "GET")
    bodies.push({ url: r.url().replace(BASE, "").replace(/[0-9a-f-]{20,}/, "ID"), status: r.status(), body: (await r.text().catch(() => "")).slice(0, 200) });
});
const toastText = () => page.evaluate(() => [...document.querySelectorAll("[role=status],[role=alert],[data-sonner-toast],[class*=toast i]")].map((e) => e.innerText.replace(/\s+/g, " ")).join(" | "));
const tryStep = async (name, fn) => { try { await fn(); } catch (e) { p.step(`STEP FAILED ${name}: ${String(e.message).split("\n")[0]}`); } };

// 1. Tour every page once.
const routes = ["/", "/chat", "/decide", "/decide/approvals", "/decide/calibrate", "/decide/dispatch", "/decide/extracts", "/finance", "/knowledge/teach", "/pager", "/saved", "/settings", "/settings/habits", "/shopping", "/status", "/workflows", "/workouts", "/does-not-exist", "/knowledge"];
const tour = [];
for (const r of routes) {
  await tryStep("tour " + r, async () => {
    const resp = await p.go(r); await settle(700);
    tour.push({ r, status: resp?.status(), finalPath: new URL(page.url()).pathname + new URL(page.url()).search });
    await p.shot("tour" + r.replace(/\//g, "_"));
  });
}
fs.writeFileSync(path.join(p.dir, "tour.json"), JSON.stringify(tour, null, 2));
const aliasRedirects = tour.filter((t) => ["/pager"].includes(t.r) && t.finalPath === "/status");
note("alerts-link-dead", false, "see below");

// 2. Assistant: send a synthetic message with the generation backend unreachable.
await tryStep("chat", async () => {
  await p.go("/chat");
  await page.locator("textarea, input[placeholder^='Message']").first().fill("synthetic hello");
  await page.keyboard.press("Enter"); await settle(2500);
  const t = await text();
  note("chat-error-jargon", /GEN_PROVIDER/.test(t), "assistant failure message exposes an env var name");
  await p.shot("chat-failure");
});

// 3. Shopping: add an item.
await tryStep("shopping", async () => {
  await p.go("/shopping");
  await page.fill("input", "synthetic item alpha"); await page.keyboard.press("Enter"); await settle(1200);
  const t = await text(); await p.shot("shopping-added");
  p.step(`shopping item visible: ${/synthetic item alpha/.test(t)}`);
});

// 4. Settings: Garmin connect, push test, notification test.
await tryStep("settings", async () => {
  await p.go("/settings");
  for (const n of ["Connections", "Notifications"]) await page.getByText(n, { exact: true }).first().click();
  await page.locator("input").first().fill("synthetic@example.invalid");
  await page.locator("input[type=password]").fill("synthetic-pass-123");
  bodies.length = 0;
  await page.getByRole("button", { name: "Connect to Garmin" }).click(); await settle(2500);
  const gc = bodies.find((b) => /garmin\/connect/.test(b.url));
  const t1 = await text();
  note("garmin-failure-reason-hidden", gc && gc.status === 401 && /EAI_AGAIN|getaddrinfo/.test(gc.body) && /Failed to connect/.test(t1) && !/EAI_AGAIN|network|unreachable|offline/i.test(t1), JSON.stringify(gc));
  await p.shot("garmin-failed");
  bodies.length = 0;
  await page.getByRole("button", { name: "Send test" }).click();
  let toast = ""; for (let i = 0; i < 6; i++) { await settle(400); toast = (await toastText()) || toast; if (toast) break; }
  const nb = bodies.find((b) => /\/api\/notify/.test(b.url));
  await p.shot("send-test");
  note("send-test-toast-lies", nb && /"pushed":false|"push":"error"/.test(nb.body) && /Test sent/i.test(toast), `toast=${toast} body=${nb?.body}`);
  bodies.length = 0;
  await page.getByRole("button", { name: "Send a test push" }).click(); await settle(2500);
  const nb2 = bodies.find((b) => /\/api\/notify/.test(b.url)); p.step("push test body", { body: nb2?.body });
});

// 5. Training and Money: disabled Sync, Send runs to watch, label edit.
await tryStep("training", async () => {
  await p.go("/workouts");
  const sync = await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find((x) => x.innerText.trim() === "Sync"); return b && { disabled: b.disabled, title: b.title, aria: b.getAttribute("aria-label") }; });
  note("sync-disabled-unexplained-training", sync && sync.disabled && !sync.title && !sync.aria, JSON.stringify(sync));
  await page.getByRole("button", { name: /Send runs to watch/ }).click(); await settle(300);
  let toast = ""; for (let i = 0; i < 6; i++) { toast = (await toastText()) || toast; if (toast) break; await settle(300); }
  p.step("send runs toast", { toast }); await p.shot("send-runs");
});
await tryStep("money", async () => {
  await p.go("/finance");
  const sync = await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find((x) => /Sync now/.test(x.innerText)); return b && { disabled: b.disabled, title: b.title }; });
  note("sync-disabled-unexplained-money", sync && sync.disabled && !sync.title, JSON.stringify(sync));
  await page.getByRole("link", { name: "Manage banks" }).first().click(); await page.waitForLoadState("networkidle"); await settle(800);
  const t = await text();
  note("manage-banks-lands-collapsed", new URL(page.url()).pathname === "/settings" && !/Enable Banking/.test(t), page.url().replace(BASE, ""));
  await p.shot("manage-banks");
});

// 6. Inbox, Saved, source detail.
await tryStep("inbox", async () => {
  await p.go("/decide");
  await page.getByRole("tab", { name: /^Approvals/ }).click(); await settle(600);
  await page.getByRole("button", { name: "Approve" }).first().click(); await settle(1500);
  await p.shot("inbox-approved");
});
await tryStep("saved", async () => {
  await p.go("/saved");
  await page.locator("main input").first().fill("zzzqq synthetic nothing"); await settle(3500);
  p.step("saved empty state", { text: /No saves match/.test(await text()) });
  await p.go("/saved");
  await page.locator("main a[href^='/decide/sources/']").first().click(); await page.waitForLoadState("networkidle"); await settle(800);
  p.step("source detail opened", { path: new URL(page.url()).pathname.replace(/[0-9a-f-]{20,}/, "ID") }); await p.shot("source-detail");
});

// 7. Teach: schedule, add topic, start lesson with generation unreachable, resume, end.
await tryStep("teach-schedule", async () => {
  await p.go("/knowledge/teach");
  await page.getByRole("button", { name: /Schedule for tomorrow/ }).click(); await settle(1200);
  const t = await text(); const m = t.match(/Scheduled for (\d{4}-\d{2}-\d{2})/);
  const todayLocal = await page.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; });
  note("schedule-tomorrow-is-today", m && m[1] === todayLocal, `label date=${m?.[1]} local today=${todayLocal}`);
  await p.shot("teach-scheduled");
});
await tryStep("teach-add", async () => {
  await p.go("/knowledge/teach");
  await page.getByRole("button", { name: /Add learning topic/ }).click();
  await page.getByPlaceholder("What do you want to learn?").fill("synthetic topic zeta");
  await page.getByPlaceholder(/Why\?/).fill("synthetic reason");
  await page.getByRole("button", { name: "Add to queue" }).click();
  let toast = ""; for (let i = 0; i < 5; i++) { await settle(300); toast = (await toastText()) || toast; }
  const visible = /synthetic topic zeta/.test(await text());
  note("add-topic-no-feedback", !toast && !visible, `toast="${toast}" visibleOnCurrentView=${visible}`);
  await p.shot("teach-added");
});
await tryStep("teach-lesson", async () => {
  await p.go("/knowledge/teach");
  const before = /Resume:/.test(await text());
  bodies.length = 0;
  await page.getByRole("button", { name: /Continue learning/ }).click(); await settle(600);
  await page.getByRole("button", { name: /4 exchanges/ }).click();
  let toast = ""; for (let i = 0; i < 6; i++) { await settle(400); toast = (await toastText()) || toast; }
  const tb = bodies.find((b) => /\/api\/teach$/.test(b.url) && b.status >= 500);
  await p.shot("teach-start-failed");
  note("teach-start-raw-error", tb && /^fetch failed$/.test(toast.trim()), `status=${tb?.status} toast="${toast}"`);
  await p.go("/knowledge/teach");
  const after = /Resume:/.test(await text());
  note("teach-failed-start-leaves-live-session", !before && after && tb, `resumeBefore=${before} resumeAfter=${after}`);
  await page.getByRole("button", { name: /^Resume/ }).click(); await page.waitForLoadState("networkidle"); await settle(1500);
  const t = await text(); await p.shot("teach-empty-session");
  note("teach-empty-live-session", /live · exchange 1 of 4/.test(t) && /Start talking|tap and just talk/.test(t) && !/error|retry|failed/i.test(t.slice(60)), "live session with only a mic button, no error, no retry");
  await page.getByRole("button", { name: "End session" }).click(); await settle(2000);
  const endBody = bodies.find((b) => /teach\/session/.test(b.url));
  note("teach-end-empty-session-files-note", endBody && /vaultPath/.test(endBody.body), "ending a session with zero exchanges returns a vault note path");
});

// 8. Today and System.
await tryStep("today", async () => {
  await p.go("/");
  await page.getByRole("button", { name: /Complete Training/ }).click(); await settle(1500);
  p.step("training completed", { text: /1\/1 Training/.test(await text()) }); await p.shot("today-completed");
});
await tryStep("status", async () => {
  await p.go("/status"); await settle(2500);
  const t = await text();
  note("status-contradiction", /docker socket unreachable/.test(t) && /All 0 containers healthy/.test(t), "banner says containers unknown, row says All 0 containers healthy");
  const alertHref = await page.locator("main a[href='/pager']").first().getAttribute("href").catch(() => null);
  await page.locator("main a[href='/pager']").first().click(); await page.waitForLoadState("networkidle"); await settle(800);
  note("alerts-link-dead", alertHref === "/pager" && new URL(page.url()).pathname === "/status", `alert item href=${alertHref} landed=${page.url().replace(BASE, "")}`);
  await p.shot("status-after-alert-click");
});

// 9. Dynamic and odd routes.
await tryStep("odd", async () => {
  await page.goto(BASE + "/knowledge/teach/bogus-id", { waitUntil: "domcontentloaded" }); await settle(1500);
  note("bogus-teach-id-silent-redirect", new URL(page.url()).pathname === "/knowledge/teach", page.url().replace(BASE, ""));
  const r = await page.goto(BASE + "/knowledge", { waitUntil: "domcontentloaded" });
  note("knowledge-index-404", r.status() === 404, `status=${r.status()}`);
});

const j = p.journal;
note("chart-size-warning", j.console.some((c) => /width\(-1\) and height\(-1\)/.test(c.text)), "recharts width/height -1 console warning on /finance and /workouts");
note("codex-sessions-502-polling", j.badResponses.filter((b) => /api\/codex\/sessions/.test(b.url) && b.status === 502).length >= 2, `count=${j.badResponses.filter((b) => /api\/codex\/sessions/.test(b.url)).length}`);
fs.writeFileSync(path.join(p.dir, "observed.json"), JSON.stringify(obs, null, 2));
const dir = await p.finish();
console.log("DIR", dir);
console.log(JSON.stringify(Object.fromEntries(Object.entries(obs).map(([k, v]) => [k, v.ok])), null, 1));

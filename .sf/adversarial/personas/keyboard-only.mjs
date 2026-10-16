// keyboard-only persona: Tab/Shift+Tab/Enter/Space/Escape/arrows only. Records shape, never page text.
import { startPersona, VIEWPORTS } from "../lib.mjs";
import fs from "node:fs";
import path from "node:path";

const ROUTES = ["/", "/chat", "/decide", "/decide/approvals", "/decide/calibrate", "/decide/dispatch", "/decide/extracts", "/finance", "/knowledge/teach", "/pager", "/saved", "/settings", "/settings/habits", "/shopping", "/status", "/workflows", "/workouts"];
const MAXTAB = 60;

const probe = () => {
  const el = document.activeElement;
  if (!el || el === document.body) return { body: true };
  const cs = getComputedStyle(el), r = el.getBoundingClientRect();
  const vis = (v) => v && v !== "none" && !/^0px/.test(v);
  const outlineOn = cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0;
  const shadowOn = cs.boxShadow !== "none";
  const name = el.getAttribute("aria-label") || el.getAttribute("aria-labelledby") && [...el.getAttribute("aria-labelledby").split(" ")].map(i => document.getElementById(i)?.textContent || "").join(" ") || (el.innerText || el.value || el.getAttribute("title") || el.getAttribute("alt") || el.getAttribute("placeholder") || "").trim();
  return {
    tag: el.tagName.toLowerCase(), role: el.getAttribute("role"), type: el.getAttribute("type"),
    hasName: name.length > 0, nameLen: name.length, hasText: (el.innerText || "").trim().length > 0, hasSvgOnly: !!el.querySelector("svg") && !(el.innerText || "").trim(),
    focusVisible: outlineOn || shadowOn, outline: outlineOn ? `${cs.outlineWidth} ${cs.outlineStyle}` : "none", shadow: shadowOn,
    x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
    inView: r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth,
    hidden: cs.visibility === "hidden" || cs.display === "none" || r.width === 0 || r.height === 0,
    inDialog: !!el.closest('[role="dialog"],[aria-modal="true"],dialog'),
    sel: el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + (el.getAttribute("data-testid") ? `[data-testid=${el.getAttribute("data-testid")}]` : ""),
    href: el.getAttribute("href") ? "href" : null, opacity: cs.opacity,
  };
};

async function tabAudit(p, route, label) {
  const page = p.page;
  await p.go(route);
  const out = { route, label, stops: [], issues: [] };
  await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
  await page.mouse.move(0, 0);
  const seen = new Map();
  let lastY = -1, backJumps = 0;
  for (let i = 0; i < MAXTAB; i++) {
    await page.keyboard.press("Tab");
    const s = await page.evaluate(probe);
    s.i = i;
    out.stops.push(s);
    if (s.body) { out.issues.push({ i, kind: "focus-left-document" }); break; }
    const key = s.sel + "@" + s.x + "," + s.y;
    if (seen.has(key)) { out.issues.push({ i, kind: "cycle-or-repeat", key }); break; }
    seen.set(key, i);
    if (!s.focusVisible) out.issues.push({ i, kind: "no-focus-indicator", sel: s.sel, role: s.role });
    if (!s.hasName) out.issues.push({ i, kind: "no-accessible-name", sel: s.sel, role: s.role });
    if (s.hidden) out.issues.push({ i, kind: "focus-on-hidden-element", sel: s.sel });
    else if (!s.inView) out.issues.push({ i, kind: "focus-offscreen", sel: s.sel });
    if (s.y + 4 < lastY - 40 && !s.hidden) backJumps++;
    if (!s.hidden) lastY = s.y;
  }
  out.backJumps = backJumps;
  if (backJumps > 2) out.issues.push({ kind: "tab-order-jumps-upward", backJumps });
  out.tabCount = out.stops.length;
  return out;
}

const p = await startPersona("keyboard-only", { viewport: VIEWPORTS.desktop });
const page = p.page;
const result = { audits: [], skip: null, dialogs: [], live: [], reduced: [] };

// 1. skip link
await p.go("/");
await page.keyboard.press("Tab");
const first = await page.evaluate(probe);
const skipText = await page.evaluate(() => document.activeElement?.getAttribute("href"));
result.skip = { firstFocusTag: first.tag, firstHasHref: first.href, hrefIsHash: String(skipText).startsWith("#"), firstVisible: first.inView && !first.hidden && first.w > 1, y: first.y };
if (result.skip.hrefIsHash) {
  await page.keyboard.press("Enter");
  result.skip.afterEnter = await page.evaluate(() => ({ hash: location.hash, activeId: document.activeElement?.id, activeTag: document.activeElement?.tagName, inMain: !!document.activeElement?.closest("main") || document.activeElement?.tagName === "MAIN" }));
}
result.skip.mainLandmarks = await page.evaluate(() => document.querySelectorAll("main,[role=main]").length);
await p.shot("home-first-tab");

// 2. per-page tab audits
for (const r of ROUTES) { try { result.audits.push(await tabAudit(p, r, "desktop")); } catch (e) { result.audits.push({ route: r, error: String(e.message).slice(0, 200) }); } }

// 3. dialogs / menus: on each route, find triggers by aria-haspopup / aria-expanded / aria-controls, open with keyboard
for (const r of ROUTES) {
  await p.go(r);
  const triggers = await page.evaluate(() => [...document.querySelectorAll('button[aria-haspopup],button[aria-expanded],[aria-controls]')].filter(e => e.getBoundingClientRect().width > 0).slice(0, 8).map((e, idx) => { e.setAttribute("data-kbtrig", String(idx)); return { idx, haspopup: e.getAttribute("aria-haspopup"), expanded: e.getAttribute("aria-expanded"), name: !!(e.getAttribute("aria-label") || e.innerText.trim()) }; }));
  for (const t of triggers) {
    const loc = page.locator(`[data-kbtrig="${t.idx}"]`);
    try {
      await loc.focus();
      await page.keyboard.press("Enter");
      await page.waitForTimeout(500);
      const open = await page.evaluate(() => ({ dlg: document.querySelectorAll('[role="dialog"],[role="alertdialog"],dialog[open],[role="menu"],[role="listbox"]').length, activeInDlg: !!document.activeElement?.closest('[role="dialog"],[role="alertdialog"],[role="menu"],[role="listbox"],dialog'), ariaModal: !!document.querySelector('[aria-modal="true"]') }));
      if (!open.dlg) { await page.keyboard.press("Escape"); continue; }
      // trap check: tab 25 times, see if focus stays inside
      let escaped = 0;
      for (let i = 0; i < 25; i++) { await page.keyboard.press("Tab"); if (!(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"],[role="alertdialog"],[role="menu"],[role="listbox"],dialog')))) escaped++; }
      await page.keyboard.press("Escape"); await page.waitForTimeout(500);
      const after = await page.evaluate(() => ({ stillOpen: document.querySelectorAll('[role="dialog"],[role="alertdialog"],dialog[open],[role="menu"]').length, activeTrig: document.activeElement?.getAttribute("data-kbtrig") }));
      result.dialogs.push({ route: r, trigger: t, open, tabsEscaped: escaped, closedByEscape: after.stillOpen === 0, focusReturned: after.activeTrig === String(t.idx) });
      if (after.stillOpen) await page.mouse.click(1, 1).catch(() => {});
    } catch (e) { result.dialogs.push({ route: r, trigger: t, error: String(e.message).slice(0, 120) }); }
  }
}
await p.shot("after-dialogs");

// 4. keyboard-only main action probes: forms, error announcement
for (const r of ROUTES) {
  await p.go(r);
  const info = await page.evaluate(() => ({
    liveRegions: document.querySelectorAll('[aria-live],[role="alert"],[role="status"]').length,
    forms: document.querySelectorAll("form").length,
    inputs: [...document.querySelectorAll("input:not([type=hidden]),textarea,select")].map(e => ({ type: e.type, labelled: !!(e.getAttribute("aria-label") || e.getAttribute("aria-labelledby") || e.id && document.querySelector(`label[for="${e.id}"]`) || e.closest("label")), placeholderOnly: !!e.placeholder && !(e.getAttribute("aria-label") || e.getAttribute("aria-labelledby") || e.id && document.querySelector(`label[for="${e.id}"]`) || e.closest("label")) })),
    headings: [...document.querySelectorAll("h1,h2,h3")].map(h => h.tagName),
    clickableNonFocusable: [...document.querySelectorAll("div[onclick],span[onclick],[role=button]:not(button):not([tabindex]),[role=link]:not(a):not([tabindex])")].length,
    tabindexPositive: [...document.querySelectorAll("[tabindex]")].filter(e => Number(e.getAttribute("tabindex")) > 0).length,
    imgNoAlt: [...document.querySelectorAll("img:not([alt])")].length,
    iconButtonsNoName: [...document.querySelectorAll("button,[role=button],a[href]")].filter(e => e.getBoundingClientRect().width > 0 && !(e.getAttribute("aria-label") || e.getAttribute("aria-labelledby") || e.innerText.trim() || e.getAttribute("title"))).length,
  }));
  result.live.push({ route: r, ...info });
}

// 5. keyboard form submit with empty/invalid synthetic input on first text-ish form per route (chat/shopping/etc.)
result.submit = [];
for (const r of ["/shopping", "/chat", "/settings/habits", "/workouts", "/saved", "/knowledge/teach", "/decide/extracts"]) {
  await p.go(r);
  const inputs = page.locator('input[type=text],input:not([type]),textarea,input[type=search]');
  const n = await inputs.count();
  if (!n) { result.submit.push({ route: r, note: "no text input" }); continue; }
  try {
    const inp = inputs.first();
    await inp.focus();
    const before = await page.evaluate(() => document.querySelectorAll('[role="alert"],[aria-live]').length);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(600);
    const emptyEnter = await page.evaluate(() => ({ alerts: [...document.querySelectorAll('[role="alert"],[aria-live="assertive"],[aria-live="polite"],[role=status]')].filter(e => (e.textContent || "").trim()).length, invalid: document.querySelectorAll(":invalid,[aria-invalid=true]").length }));
    await inp.fill("kbd-synthetic-test");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(1200);
    const afterEnter = await page.evaluate(() => ({ alerts: [...document.querySelectorAll('[role="alert"],[aria-live],[role=status]')].filter(e => (e.textContent || "").trim()).length, activeTag: document.activeElement?.tagName, activeIsBody: document.activeElement === document.body }));
    result.submit.push({ route: r, before, emptyEnter, afterEnter });
  } catch (e) { result.submit.push({ route: r, error: String(e.message).slice(0, 150) }); }
}
await p.shot("after-submit");
await p.finish();

// 6. reduced motion pass
const q = await startPersona("keyboard-only", { viewport: VIEWPORTS.desktop, reducedMotion: "reduce" });
for (const r of ROUTES) {
  await q.go(r);
  const m = await q.page.evaluate(() => {
    const ms = (v) => Math.max(0, ...String(v).split(",").map(s => { s = s.trim(); return s.endsWith("ms") ? parseFloat(s) : parseFloat(s) * 1000; }).filter(n => !isNaN(n)));
    let anim = 0, trans = 0, longAnim = 0, infinite = 0, longTrans = 0; const sel = [];
    for (const el of document.querySelectorAll("body *")) {
      const cs = getComputedStyle(el);
      if (cs.animationName !== "none") { anim++; if (ms(cs.animationDuration) > 50) { longAnim++; if (sel.length < 5) sel.push(el.tagName.toLowerCase() + "." + String(el.className).toString().slice(0, 40)); } if (cs.animationIterationCount === "infinite" && ms(cs.animationDuration) > 50) infinite++; }
      if (ms(cs.transitionDuration) > 0) { trans++; if (ms(cs.transitionDuration) > 100) longTrans++; }
    }
    return { mq: matchMedia("(prefers-reduced-motion: reduce)").matches, anim, longAnim, infinite, trans, longTrans, sel, scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior };
  });
  result.reduced.push({ route: r, ...m });
}
await q.finish();

const dir = path.join(process.env.SF_EVIDENCE_DIR ?? path.join(process.env.HOME, "apps/lifeos-sf-field-data/evidence"), "keyboard-only");
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, "raw-results.json"), JSON.stringify(result, null, 2));
console.log("done", dir);

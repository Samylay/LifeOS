// Persona phone-viewport: one-handed phone usability. Records layout shape only, never page text.
import { startPersona } from "../lib.mjs";
import fs from "node:fs";
import path from "node:path";

const ROUTES = ["/", "/chat", "/decide", "/decide/approvals", "/decide/calibrate", "/decide/dispatch", "/decide/extracts", "/finance", "/knowledge/teach", "/pager", "/saved", "/settings", "/settings/habits", "/shopping", "/status", "/workflows", "/workouts"];
const SIZES = [{ width: 390, height: 844 }, { width: 360, height: 740 }];
const DANGER = /delet|remov|send|approv|reject|dispatch|run|pay|sync|logout|sign|clear|reset|archive|discard|cancel|stop|restart/i;
const EV = process.env.SF_EVIDENCE_DIR ?? path.join(process.env.HOME, "apps/lifeos-sf-field-data/evidence");
const out = path.join(EV, "phone-viewport"); fs.mkdirSync(out, { recursive: true });
const all = [];

const MEASURE = () => {
  const iw = innerWidth;
  const desc = (el) => { const c = typeof el.className === "string" ? el.className.split(/\s+/).slice(0, 4).join(".") : ""; return `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}${c ? "." + c : ""}`; };
  const over = [];
  for (const el of document.querySelectorAll("body *")) {
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
    const cs = getComputedStyle(el); if (cs.visibility === "hidden" || cs.display === "none") continue;
    if (r.right > iw + 1 || r.left < -1) {
      // skip when an ancestor clips/scrolls horizontally
      let a = el.parentElement, clipped = false;
      while (a && a !== document.body) { const o = getComputedStyle(a).overflowX; if (o !== "visible") { clipped = true; break; } a = a.parentElement; }
      if (!clipped) over.push({ el: desc(el), left: Math.round(r.left), right: Math.round(r.right) });
    }
  }
  const taps = [];
  for (const el of document.querySelectorAll("a[href], button, [role=button], input:not([type=hidden]), select, textarea, [role=tab], [role=switch], [role=checkbox]")) {
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
    const cs = getComputedStyle(el); if (cs.visibility === "hidden" || cs.display === "none" || cs.pointerEvents === "none") continue;
    if (r.bottom < 0 || r.top > innerHeight * 5) continue;
    if (r.width < 44 || r.height < 44) taps.push({ el: desc(el), w: Math.round(r.width), h: Math.round(r.height), hasText: Boolean((el.textContent || "").trim()), inNav: Boolean(el.closest("nav")) });
  }
  // fixed bottom bar
  let bar = null;
  for (const el of document.querySelectorAll("body *")) {
    const cs = getComputedStyle(el); if (cs.position !== "fixed") continue;
    const r = el.getBoundingClientRect(); if (r.width > iw * 0.8 && r.height > 30 && r.height < 200 && r.bottom >= innerHeight - 2) { bar = { el: desc(el), top: Math.round(r.top), h: Math.round(r.height) }; break; }
  }
  return { sw: document.documentElement.scrollWidth, iw, bsw: document.body.scrollWidth, over: over.slice(0, 8), overCount: over.length, taps, bar, docH: document.documentElement.scrollHeight };
};

for (const size of SIZES) {
  const p = await startPersona("phone-viewport", { viewport: size, touch: true, mobile: true });
  const tag = `${size.width}x${size.height}`;
  const page = p.page;
  const rec = (route, kind, detail, shot) => { all.push({ size: tag, route, kind, detail, shot }); p.finding({ route, kind, detail, size: tag, shot }); };
  // discover dynamic routes
  const dyn = [];
  for (const [list, pre] of [["/decide", "/decide/sources/"], ["/knowledge/teach", "/knowledge/teach/"]]) {
    await p.go(list);
    const hrefs = await page.$$eval("a[href]", (as, pre) => as.map((a) => a.getAttribute("href")).filter((h) => h && h.startsWith(pre)), pre);
    if (hrefs[0]) dyn.push(hrefs[0]);
  }
  for (const route of [...ROUTES, ...dyn]) {
    const label = route.replace(/[^a-z0-9]+/gi, "_").replace(/_[0-9a-f-]{8,}.*/, "_id");
    try {
      await p.go(route); await page.waitForTimeout(600);
      const m = await page.evaluate(MEASURE);
      p.step(`measure ${route}`, { size: tag, sw: m.sw, iw: m.iw, overCount: m.overCount, smallTaps: m.taps.length });
      if (m.sw > m.iw + 1 || m.bsw > m.iw + 1) { const s = await p.shot(`${tag}-${label}-hoverflow`); rec(route, "h-overflow", { sw: m.sw, iw: m.iw, elements: m.over }, s); }
      const prim = m.taps.filter((t) => t.hasText || t.inNav || /button|a\./.test(t.el));
      if (prim.some((t) => t.h < 40 || t.w < 40) && m.taps.length) { const sh = await p.shot(`${tag}-${label}-smalltaps`); rec(route, "small-tap-targets", { count: m.taps.length, sample: m.taps.slice(0, 12) }, sh); }
      if (m.taps.length) all.push({ size: tag, route, kind: "small-taps-summary", detail: { count: m.taps.length, sample: m.taps.slice(0, 12) } });
      // bottom nav cover check removed: a naive measure gave false positives; verified by screenshot that last items clear the bar.
      // synthetic long-word input into text fields
      const inputs = await page.$$("input[type=text], input:not([type]), input[type=search], textarea");
      if (inputs.length) {
        const bottomMost = (await Promise.all(inputs.map(async (h) => ({ h, b: (await h.boundingBox())?.y ?? -1 })))).sort((a, b) => b.b - a.b)[0];
        if (bottomMost && bottomMost.b >= 0) {
          await bottomMost.h.scrollIntoViewIfNeeded().catch(() => {});
          await bottomMost.h.tap({ timeout: 3000 }).catch(() => {});
          await page.setViewportSize({ width: size.width, height: Math.round(size.height * 0.55) }); await page.waitForTimeout(300);
          const vis = await bottomMost.h.evaluate((el) => { const r = el.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), vh: innerHeight, focused: document.activeElement === el }; });
          if (vis.focused && (vis.bottom > vis.vh || vis.top < 0)) { const s = await p.shot(`${tag}-${label}-keyboard`); rec(route, "focused-input-hidden-when-keyboard-open", vis, s); }
          await page.setViewportSize(size);
          await bottomMost.h.fill("W".repeat(120) + " " + "9".repeat(60)).catch(() => {});
          await page.waitForTimeout(300);
          const m2 = await page.evaluate(MEASURE);
          if (m2.sw > m2.iw + 1) { const s = await p.shot(`${tag}-${label}-longword`); rec(route, "long-word-overflow", { sw: m2.sw, iw: m2.iw, elements: m2.over }, s); }
          await bottomMost.h.fill("").catch(() => {});
        }
      }
      // open dialogs / sheets via safe triggers
      const trig = await page.$$("[aria-haspopup=dialog], [data-vaul-drawer-trigger], button[aria-label], button");
      let opened = 0;
      for (let i = 0; i < trig.length && opened < 6; i++) {
        const h = trig[i];
        const info = await h.evaluate((el) => { const r = el.getBoundingClientRect(); return { ok: r.width > 0 && r.height > 0 && r.top < innerHeight && r.bottom > 0, txt: ((el.textContent || "") + (el.getAttribute("aria-label") || "")), popup: el.getAttribute("aria-haspopup") === "dialog" || el.hasAttribute("data-vaul-drawer-trigger"), nav: Boolean(el.closest("nav")) }; }).catch(() => null);
        if (!info || !info.ok || info.nav || DANGER.test(info.txt)) continue;
        if (!info.popup && i > 25) break;
        const before = page.url();
        await h.tap({ timeout: 2000 }).catch(() => {});
        await page.waitForTimeout(500);
        const d = await page.evaluate(() => {
          const el = document.querySelector("[role=dialog], [data-vaul-drawer]"); if (!el) return null;
          const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
          const sc = el.scrollHeight > el.clientHeight + 1; const inner = [...el.querySelectorAll("*")].some((c) => c.scrollHeight > c.clientHeight + 1 && ["auto", "scroll"].includes(getComputedStyle(c).overflowY));
          const close = [...el.querySelectorAll("button")].filter((b) => /close|cancel|done|×|x/i.test((b.getAttribute("aria-label") || "") + b.textContent)).length;
          return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), vh: innerHeight, vw: innerWidth, h: Math.round(r.height), scrollable: sc || inner, overflowY: cs.overflowY, closeBtns: close, sw: el.scrollWidth, cw: el.clientWidth };
        });
        if (d) {
          opened++;
          const fits = d.top >= -1 && d.bottom <= d.vh + 1 && d.left >= -1 && d.right <= d.vw + 1;
          const hscroll = d.sw > d.cw + 1;
          p.step(`dialog opened ${route}`, { size: tag, ...d });
          if (!fits || hscroll || (d.h >= d.vh - 2 && !d.scrollable && d.closeBtns === 0)) { const s = await p.shot(`${tag}-${label}-dialog${opened}`); rec(route, "dialog-layout", { ...d, fits, hscroll }, s); }
          // close by Escape then check
          await page.keyboard.press("Escape"); await page.waitForTimeout(500);
          let still = await page.evaluate(() => Boolean(document.querySelector("[role=dialog]")));
          if (still) { await page.touchscreen.tap(size.width / 2, 8); await page.waitForTimeout(500); still = await page.evaluate(() => Boolean(document.querySelector("[role=dialog]"))); if (still) { const s = await p.shot(`${tag}-${label}-dialog-stuck${opened}`); rec(route, "dialog-wont-close", { ...d }, s); await page.reload().catch(() => {}); await page.waitForTimeout(500); } }
        } else if (page.url() !== before) { await p.go(route); await page.waitForTimeout(400); }
      }
    } catch (e) { p.step(`error ${route}: ${String(e.message).slice(0, 150)}`); }
  }
  await p.finish();
}
fs.writeFileSync(path.join(out, "raw-observations.json"), JSON.stringify(all, null, 2));
console.log("observations", all.length);

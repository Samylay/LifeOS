// Shared harness for the adversarial personas and verify-lifeos journeys.
// Drives the sandbox (never port 3000) with system Chrome through playwright-core and
// records what a QA engineer would: steps, screenshots, console errors, page errors,
// failed requests, 4xx/5xx responses and every request that tried to leave 127.0.0.1.
//
// Evidence holds real snapshot data, so raw files go OUTSIDE every git repo
// ($SF_EVIDENCE_DIR). `shot(name, { redact: true })` also writes a copy with every
// text glyph, input value and image masked, which is the only kind allowed in reports.
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

export const BASE = process.env.SF_BASE_URL ?? "http://127.0.0.1:3110";
if (/:3000\b/.test(BASE)) throw new Error("lib: port 3000 is the live LifeOS. Use the sandbox.");
const EVIDENCE = process.env.SF_EVIDENCE_DIR ?? path.join(process.env.HOME, "apps/lifeos-sf-field-data/evidence");
const CHROME = process.env.SF_CHROME ?? "/opt/google/chrome/google-chrome";

export const VIEWPORTS = { phone: { width: 390, height: 844 }, desktop: { width: 1280, height: 800 } };

/** Masks every text node, input value and image so a screenshot shows layout only.
 *  Reversible: `unredact(page)` restores the page so the journey can continue. */
export async function redact(page) {
  await page.evaluate(() => {
    const mask = (s) => s.replace(/[^\s]/g, "x");
    const saved = (window.__sfRedacted = { text: [], inputs: [], media: [] });
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) { saved.text.push([n, n.nodeValue]); n.nodeValue = mask(n.nodeValue); }
    for (const el of document.querySelectorAll("input, textarea")) { saved.inputs.push([el, el.value, el.placeholder]); el.value = mask(el.value); el.placeholder = mask(el.placeholder || ""); }
    for (const el of document.querySelectorAll("img, svg image, video, canvas")) { saved.media.push([el, el.style.filter]); el.style.filter = "blur(24px) grayscale(1)"; }
  });
}
export async function unredact(page) {
  await page.evaluate(() => {
    const saved = window.__sfRedacted; if (!saved) return;
    for (const [n, v] of saved.text) n.nodeValue = v;
    for (const [el, v, p] of saved.inputs) { el.value = v; el.placeholder = p; }
    for (const [el, f] of saved.media) el.style.filter = f;
    delete window.__sfRedacted;
  });
}

export async function startPersona(persona, opts = {}) {
  const runId = `${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const dir = path.join(EVIDENCE, persona, runId);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const browser = await chromium.launch({
    executablePath: CHROME,
    // The browser may resolve only the sandbox. Everything else fails at DNS.
    args: ["--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE 127.0.0.1"],
  });
  const context = await browser.newContext({
    viewport: opts.viewport ?? VIEWPORTS.desktop,
    hasTouch: Boolean(opts.touch), isMobile: Boolean(opts.mobile),
    reducedMotion: opts.reducedMotion ?? "no-preference",
  });
  const journal = { persona, runId, base: BASE, opts, steps: [], console: [], pageErrors: [], failedRequests: [], badResponses: [], blockedOutbound: [], shots: [] };
  await context.route("**/*", (route) => {
    const url = route.request().url();
    if (/^(https?|wss?):\/\/127\.0\.0\.1(:\d+)?\//.test(url) || url.startsWith("data:") || url.startsWith("blob:")) return route.continue();
    journal.blockedOutbound.push({ url: url.split("?")[0], t: Date.now() });
    return route.abort("blockedbyclient");
  });
  if (opts.slowNetwork) {
    const cdp = await context.newCDPSession(await context.newPage());
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 400, downloadThroughput: 50 * 1024, uploadThroughput: 20 * 1024 });
  }
  const page = opts.slowNetwork ? context.pages()[0] : await context.newPage();
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") journal.console.push({ type: m.type(), text: m.text().slice(0, 400), url: page.url() }); });
  page.on("pageerror", (e) => journal.pageErrors.push({ message: String(e.message).slice(0, 400), url: page.url() }));
  page.on("requestfailed", (r) => { const f = r.failure()?.errorText; if (f !== "net::ERR_BLOCKED_BY_CLIENT" && f !== "net::ERR_ABORTED") journal.failedRequests.push({ url: r.url().split("?")[0], method: r.method(), error: f }); });
  page.on("response", (r) => { if (r.status() >= 400) journal.badResponses.push({ url: r.url().split("?")[0], method: r.request().method(), status: r.status() }); });

  let n = 0;
  const api = {
    page, context, browser, dir, journal,
    step(what, extra = {}) { journal.steps.push({ i: journal.steps.length + 1, t: new Date().toISOString(), what, url: page.url(), ...extra }); },
    async go(route) { const r = await page.goto(BASE + route, { waitUntil: "domcontentloaded" }); await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {}); api.step(`open ${route}`, { status: r?.status() }); return r; },
    async shot(name, { redact: doRedact = true } = {}) {
      const base = `${String(++n).padStart(2, "0")}-${name}`;
      await page.screenshot({ path: path.join(dir, `${base}.png`), fullPage: false });
      if (doRedact) { await redact(page); await page.screenshot({ path: path.join(dir, `${base}.redacted.png`) }); await unredact(page); }
      journal.shots.push(base);
      return base;
    },
    finding(f) { (journal.findings ??= []).push({ ...f, url: page.url(), t: new Date().toISOString() }); },
    async finish() {
      fs.writeFileSync(path.join(dir, "journal.json"), JSON.stringify(journal, null, 2));
      await browser.close();
      return dir;
    },
  };
  return api;
}
